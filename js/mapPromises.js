
(function (window) {
    "use strict";
    var ImageHandler = window.ImageHandler;
    var STATUS_CODES = window.dap.STATUS_CODES;
    var EventEmitter = window.EventEmitter;
    if (typeof STATUS_CODES == undefined && (typeof require == "function")) {
        STATUS_CODES = require("./dap.js").STATUS_CODES;
    }
    if (typeof ImageHandler == "undefined" && (typeof require == "function")) {
        ImageHandler = require('./imageHandler.js')
    }
    if (typeof EventEmitter == "undefined" && (typeof require == "function")) {
        EventEmitter = window.EventEmitter = require("./eventEmitter.js");
    }
    class MapPromises extends EventEmitter {
        constructor(mapWidget, dapClient, wktParser) {
            super();
            this.mapWidget = mapWidget;
            this.dapClient = dapClient;
            this.imageCache = {};
            this.clearMap();
            this.cacheExpirationTime = 3600000;//1h

            this.regexps = {
                allowedTypes: /^\/amtech\/linkeddata\/types\/composite\/entity\/[^\/]+$/
            }
            this.wktValidationFunction = function (wkt) { return true }
            if (wktParser && wktParser.isValidWkt) {
                this.wktValidationFunction = wktParser.isValidWkt;
            }
            this.imageHandler = new ImageHandler(dapClient);
            this.mapWidget.addEventListener("map:loading", () => { this.setStatus("__map", "loading") });
            this.mapWidget.addEventListener("map:load", () => {
                if (this.getStatus("__map") == "loading") {
                    this.setStatus("__map", undefined)
                }
            });
            this.setLogger(logger);
        }
        setLogger(logger) {
            this.logger = logger || console;
            this.imageHandler.setLogger(logger);
        }
        clearMap() {
            this.clearImageCache();
            this.resourcePromises = {};
            this.proximityAreas = [];
            this.status = {
                __count: 0
            }
            this.mapWidget.clearMap();
        }
        isIdle() {
            return this.status.__count == 0;
        }
        getStatus(id) {
            return this.status[id];
        }
        setStatus(id, status) {
            this.logger.debug("setting status of " + id + " to " + status);
            if (status == undefined || status === false) {
                if (this.status[id]) {
                    delete this.status[id];
                    this.status.__count--;
                    if (this.status.__count == 0) {
                        this.fireEvent("load");
                    }

                }
            } else {
                if (!(id in this.status)) {
                    if (this.status.__count == 0) {
                        this.fireEvent("loading");
                    }
                    this.status.__count++;
                }
                this.status[id] = status;
            }
        }
        clearImageCache() {
            for (var key in this.imageCache) {
                if (this.imageCache.hasOwnProperty(key)) {
                    this.imageCache[key].then((response) => { this.imageHandler.releaseImage(response); });
                }
            }
            this.imageCache = {};

            for (var key in this.floorplanPromises) {
                if (this.floorplanPromises.hasOwnProperty(key) && this.floorplanPromises[key].promise) {
                    this.floorplanPromises[key].promise.then((response) => { this.imageHandler.releaseImage(response); });
                }
            }
            this.floorplanPromises = {};
        }

        getResourcePromiseObj(resource) {
            var resourceUri = resource;
            var promiseObj;
            var isCreated = false;
            if (typeof resource != "string") {
                resourceUri = resource["@id"];
                promiseObj = {
                    promise: this.resourcePromises[resourceUri] = Promise.resolve(resource)
                        .then(this.convertResource.bind(this)),
                    time: Infinity
                }
                isCreated = true;
            } else if (resource.length > 0) {
                var promiseObj = this.resourcePromises[resourceUri];
                var now = Date.now();
                if (!promiseObj || (promiseObj.time != undefined && now - promiseObj.time > this.cacheExpirationTime)) {
                    var promise = Promise.resolve(resourceUri)
                        .then((response) => {
                            this.setStatus(resourceUri, "loading");
                            return this.dapClient.getResource(response).then((response) => {
                                var data = response;
                                if (response.contentType) {
                                    data = response.content;
                                }
                                return data;
                            });
                        });
                    promiseObj = {
                        promise: promise.then((response) => {
                            this.resourcePromises[resourceUri].time = Date.now();
                            return response;
                        }).then(this.convertResource.bind(this)),
                    }
                    isCreated = true;
                }

            } else {
                return Promise.reject(new Error("invalid resource uri: '" + resource + "'"));
            }
            if (isCreated) {
                promiseObj.promise = promiseObj.promise.then((response) => { this.setStatus(resourceUri, undefined); return response });
            }
            this.resourcePromises[resourceUri] = promiseObj
            return promiseObj;
        }
        getResource(resource) {
            return this.getResourcePromiseObj(resource).promise;
        }
        getFloorplanImage(resourceUri, params) {
            var object = this.floorplanPromises[resourceUri];
            var now = Date.now();
            if (!object || (object.time != undefined && now - object.time > this.cacheExpirationTime)) {
                this.setStatus("floorplan_" + resourceUri, "loading image")
                var promise = this.getImageHandler().getImageFromUrl(resourceUri, params);
                object = this.floorplanPromises[resourceUri] = {
                    promise: promise.then((response) => {
                        this.floorplanPromises[resourceUri].time = Date.now();
                        return response;
                    }).catch((error) => {
                        delete this.floorplanPromises[resourceUri];
                        this.logger.info("error getting image " + resourceUri, error.statusCode ? "( Code " + error.statusCode + ")" : "");
                        return error;
                    }).then((response) => {
                        this.setStatus("floorplan_" + resourceUri, undefined);
                        return response
                    })
                }
            }
            return object.promise;
        }
        addProximityArea(resource) {
            this.proximityAreas.push(resource);
        }
        convertResource(json) {

            var url = json['@id'] || '';
            var itemType = json['@type'] || '';
            var error;
            if (!url || !itemType) {
                error = new Error("resource without url or type");
            } else if (!itemType.startsWith(amtech.console.PATHS.TYPE_ENTITY)) {
                error = new Error("Only entities can be represented ");
            }
            if (error) {
                error.statusCode = STATUS_CODES.BadRequest.code;
                throw error;

            }
            this.setStatus(url, "converting");
            var data = json;
            data.shortName = url.replace(amtech.console.PATHS.ENTITIES + "/", "");
            var iconData;

            if (json["proximityarea"] && json["proximityarea"].length > 0) {
                data.proximityarea = json["proximityarea"];
            }
            if (this.regexps.allowedTypes.test(itemType)) {

                data.icon = this.imageHandler.getImageCssClassName(itemType);
                data.iconUrl = itemType;
                if (!this.imageCache[itemType]) {
                    var id = "image_" + itemType;
                    this.setStatus(id, "loading");
                    this.imageCache[itemType] = this.imageHandler.setClassForUrl(itemType, data.icon, true)
                        .then(
                            (response) => { this.logger.debug(" loaded image for " + itemType); return response }
                        ).then(
                            (response) => { this.setStatus(id); return response },
                            (error) => { this.setStatus(id); throw error }
                        );;
                }
                iconData = this.imageCache[itemType];
                var locationData = json['location'];
                var locationJson;
                try {
                    locationJson = this.mapWidget.fromOldLocation(locationData || '{}');
                } catch (e) {
                    this.logger.error('locationJson', e);
                }

                if (!locationJson) {
                    this.logger.info("Invalid location on resource " + url);
                } else if (locationJson.wkt && locationJson.wkt.length > 0 && !this.wktValidationFunction(locationJson.wkt)) {
                    // error with thing location wkt
                    this.logger.info("Invalid wkt on resource " + url + ". WKT=" + locationJson.wkt);
                } else {
                    data.locationJson = locationJson;
                    data.location = locationJson.wkt;

                    var floorplan = json['floorplan'];
                    var floorplanJson = undefined;
                    if (floorplan && floorplan.location) {

                        var floorplanLocationJson = undefined;
                        try {
                            floorplanLocationJson = this.mapWidget.fromOldLocation(floorplan.location);
                        } catch (e) {
                            this.logger.error('locationJson', e);
                        }
                        if (!floorplanLocationJson) {
                            this.logger.info("Invalid location on floorplan calibration " + url);
                        } else if (floorplanLocationJson.wkt && floorplanLocationJson.wkt.length > 0 && !this.wktValidationFunction(floorplanLocationJson.wkt)) {
                            // error with thing location wkt
                            this.logger.info("Invalid wkt on floorplan calibration for " + url + ". WKT=" + locationJson.wkt);
                        }

                        var imageUrl = floorplan["imageurl"] || '';
                        var floorplanPromise = (imageUrl.length > 0) ? this.getFloorplanImage(imageUrl) : '';
                        data.floorplan = {
                            location: floorplanLocationJson,
                            imageurl: ''
                        }
                        if (floorplanPromise instanceof Promise) {
                            floorplanPromise.then((response) => {
                                if (!(response instanceof Error)) {
                                    data.floorplan.imageurl = response;
                                    if (this.mapWidget.hasElement(url)) {
                                        this.mapWidget.updateElement({
                                            "@id": url,
                                            floorplan: {
                                                location: floorplanLocationJson,
                                                imageurl: response
                                            }
                                        });
                                    }
                                }
                            })
                        }
                    }
                }

            }
            // if (iconData!=undefined && (iconData instanceof Promise)){

            // }else
            return data
        }
        getImageHandler() {
            return this.imageHandler;
        }
        processElement(data) {
            this.setStatus(data.url, "adding to map");
            this.mapWidget.updateElement(data);
            return data;
        }
        processProximityArea(data) {
            this.setStatus(data.url, "adding as proximity area");
            this.mapWidget.addProximityArea(data);
            return data;
        }
        addElements(list) {
            return this.processElementList(list, this.processElement, this).then((response) => {
                return this.addProximityAreas();
            });
        }
        addElement(elem) {
            return this.addElements([elem])

        }
        addQueryResults(queryUrl, params) {

            this.setStatus(queryUrl, "loading");
            return this.dapClient.getQueryResults(queryUrl, params)
                .then((response) => {
                    this.setStatus(queryUrl, "processing elements");
                    if (this.logger.isDebugEnabled()) {
                        this.logger.debug(JSON.stringify(response, [], 2));
                    }
                    return response;
                })
                .then(this.addElements.bind(this))
                .then(
                    (response) => { this.setStatus(queryUrl, undefined); return response },
                    (error) => { this.setStatus(queryUrl); throw error }
                );

        }
        processElementList(list, callback, context) {
            if (!Array.isArray(list)) {
                var error = new Error("Expecting a list of elements");
                error = STATUS_CODES.BadRequest.code;
                return Promise.reject(error);
            }
            for (var i = 0; i < list.length; i++) {
                if (typeof list[i] != "string") {
                    let obj = this.getResource(list[i]);
                    list[i] = list[i]['@id'] || '';
                }
            }
            var elemPromises = list.map((item) => {
                var promiseObj = this.getResource(item);
                return promiseObj.then((response) => {
                    return callback.call(context, response)
                }).then(
                    (response) => { this.setStatus(item, undefined); return response },
                    (error) => { this.setStatus(item); throw error }
                )
            });
            //return Q.all(elemPromises);
            return Promise.all(elemPromises);
        }
        addProximityAreas() {
            if (this.proximityAreas && this.proximityAreas.length > 0) {
                return this.processElementList(this.proximityAreas, this.processProximityArea, this);
            } else {
                return Promise.resolve([]);
            }

        }
        fireEvent(eventType, eventData) {
            if (this.logger.isDebugEnabled()) {
                this.logger.debug("======> sending event " + eventType + " with \n  ======>");
                console.log(eventData);
            }
            super.fireEvent(eventType, eventData);

        }
        centerToLayers(response) {
            var timeout = 500;
            return Promise.resolve(this.mapWidget).then((mapWidget) => {

                this.setStatus("__map", "centering map");
                return new Promise((resolve, reject) => {
                    var timerId;
                    var state = -1;
                    var fcnOnLoad = () => {
                        if (state <= 0) {
                            clearTimeout(timerId);
                            this.logger.debug("map ends loading");
                            mapWidget.removeEventListener('map:load', fcnOnLoad);
                            resolve(response);
                        }
                    };
                    var fcnOnLoading = () => {
                        this.logger.debug("on loading event received while state = ", state);
                        if (state < 0) {
                            state = 0;//loading
                            clearTimeout(timerId);
                            this.logger.debug("waiting for load event");
                        }
                    };
                    mapWidget.addEventListener('map:load', fcnOnLoad);
                    mapWidget.addEventListenerOnce('map:loading', fcnOnLoading);
                    mapWidget.onresize();
                    mapWidget.centerToLayers();
                    mapWidget.map.invalidateSize();
                    logger.debug("invalidated sizes - waiting to start loading");
                    timerId = setTimeout(() => {
                        if (state < 0) {
                            mapWidget.removeEventListenerOnce('map:loading', fcnOnLoading);
                            this.logger.debug("map is not loading ");
                            fcnOnLoad();
                        }
                    }, timeout);

                })
            }).then(
                (response) => { this.setStatus("__map", undefined); return response },
                (error) => { this.setStatus("__map"); throw error }
            )
        }
    }
    var createMapPromises = function (mapWidget, dapClient, wktParser) {
        return new MapPromises(mapWidget, dapClient, wktParser);
    }
    if (typeof module !== "undefined") {
        module.exports = {
            createMapPromises: createMapPromises
        }


    } else {
        window.createMapPromises = createMapPromises;
    }
})(this);