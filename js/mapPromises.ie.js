
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
    var MapPromises = EventEmitter.extend({
        init: function (mapWidget, dapClient, wktParser) {
            var self=this;
            this._super();
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
            this.mapWidget.addEventListener("map:loading", function()  { self.setStatus("__map", "loading") });
            this.mapWidget.addEventListener("map:load", function() {
                if (self.getStatus("__map") == "loading") {
                    self.setStatus("__map", undefined)
                }
            });
            this.setLogger(logger);
        },
        setLogger: function (logger) {
            this.logger = logger || console;
            this.imageHandler.setLogger(logger);
        },
        clearMap: function () {
            this.clearImageCache();
            this.resourcePromises = {};
            this.proximityAreas = [];
            this.status = {
                __count: 0
            }
            this.mapWidget.clearMap();
        },
        isIdle: function () {
            return this.status.__count == 0;
        },
        getStatus: function (id) {
            return this.status[id];
        },
        setStatus: function (id, status) {
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
        },
        clearImageCache: function () {
            var self=this;
            for (var key in this.imageCache) {
                if (this.imageCache.hasOwnProperty(key)) {
                    this.imageCache[key].then(function(response) { self.imageHandler.releaseImage(response); });
                }
            }
            this.imageCache = {};


            for (var key in this.floorplanPromises) {
                if (this.floorplanPromises.hasOwnProperty(key) && this.floorplanPromises[key].promise) {
                    this.floorplanPromises[key].promise.then(function(response) { self.imageHandler.releaseImage(response); });
                }
            }
            this.floorplanPromises = {};
        },

        getResourcePromiseObj: function (resource) {
            var self=this;
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
                        .then(function(response)  {
                            self.setStatus(resourceUri, "loading");
                            return self.dapClient.getResource(response).then(function(response) {
                                var data = response;
                                if (response.contentType) {
                                    data = response.content;
                                }
                                return data;
                            });
                        });
                    promiseObj = {
                        promise: promise.then(function(response)  {
                            self.resourcePromises[resourceUri].time = Date.now();
                            return response;
                        }).then(this.convertResource.bind(this)),
                    }
                    isCreated = true;
                }

            } else {
                return Promise.reject(new Error("invalid resource uri: '" + resource + "'"));
            }
            if (isCreated) {
                promiseObj.promise = promiseObj.promise.then(function(response){ self.setStatus(resourceUri, undefined); return response });
            }
            this.resourcePromises[resourceUri] = promiseObj
            return promiseObj;
        },
        getResource: function (resource) {
            return this.getResourcePromiseObj(resource).promise;
        },
        getFloorplanImage: function (resourceUri, params) {
            var self=this;
            var object = this.floorplanPromises[resourceUri];
            var now = Date.now();
            if (!object || (object.time != undefined && now - object.time > this.cacheExpirationTime)) {
                this.setStatus("floorplan_" + resourceUri, "loading image")
                var promise = this.getImageHandler().getImageFromUrl(resourceUri, params);
                object = this.floorplanPromises[resourceUri] = {
                    promise: promise.then(function(response)  {
                        self.floorplanPromises[resourceUri].time = Date.now();
                        return response;
                    }).catch(function(error)  {
                        delete self.floorplanPromises[resourceUri];
                        self.logger.info("error getting image " + resourceUri, error.statusCode ? "( Code " + error.statusCode + ")" : "");
                        return error;
                    }).then(function(response) {
                        self.setStatus("floorplan_" + resourceUri, undefined);
                        return response
                    })
                }
            }
            return object.promise;
        },
        addProximityArea: function (resource) {
            this.proximityAreas.push(resource);
        },
        convertResource: function (json) {
            var self=this;

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
                            function(response)  { self.logger.debug(" loaded image for " + itemType); return response }
                        ).then(
                            function(response)  { self.setStatus(id); return response },
                            function(error)  { self.setStatus(id); throw error }
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
                            floorplanPromise.then(function(response)  {
                                if (!(response instanceof Error)) {
                                    data.floorplan.imageurl = response;
                                    if (self.mapWidget.hasElement(url)) {
                                        self.mapWidget.updateElement({
                                            url: url,
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
        },
        getImageHandler: function () {
            return this.imageHandler;
        },
        processElement: function (data) {
            this.setStatus(data.url, "adding to map");
            this.mapWidget.updateElement(data);
            return data;
        },
        processProximityArea: function (data) {
            this.setStatus(data.url, "adding as proximity area");
            this.mapWidget.addProximityArea(data);
            return data;
        },
        addElements: function (list) {
            var self=this;
            return this.processElementList(list, this.processElement, this).then(function(response)  {
                return self.addProximityAreas();
            });
        },
        addElement: function (elem) {
            return this.addElements([elem])

        },
        addQueryResults: function (queryUrl, params) {
            var self=this;
            this.setStatus(queryUrl, "loading");
            return this.dapClient.getQueryResults(queryUrl, params)
                .then(function(response)  {
                    self.setStatus(queryUrl, "processing elements");
                    if (self.logger.isDebugEnabled()) {
                        self.logger.debug(JSON.stringify(response, [], 2));
                    }
                    return response;
                })
                .then(this.addElements.bind(this))
                .then(
                    function(response) { self.setStatus(queryUrl, undefined); return response },
                    function(error) { self.setStatus(queryUrl); throw error }
                );

        },
        processElementList: function (list, callback, context) {
            var self=this;
            if (!Array.isArray(list)) {
                var error = new Error("Expecting a list of elements");
                error = STATUS_CODES.BadRequest.code;
                return Promise.reject(error);
            }
            for (var i = 0; i < list.length; i++) {
                if (typeof list[i] != "string") {
                    var obj = this.getResource(list[i]);
                    list[i] = list[i]['@id'] || '';
                }
            }
            var elemPromises = list.map(function(item) {
                var promiseObj = self.getResource(item);
                return promiseObj.then(function(response) {
                    return callback.call(context, response)
                }).then(
                    function(response) { self.setStatus(item, undefined); return response },
                    function(error) { self.setStatus(item); throw error }
                )
            });
            //return Q.all(elemPromises);
            return Promise.all(elemPromises);
        },
        addProximityAreas: function () {
            if (this.proximityAreas && this.proximityAreas.length > 0) {
                return this.processElementList(this.proximityAreas, this.processProximityArea, this);
            } else {
                return Promise.resolve([]);
            }

        },
        fireEvent: function (eventType, eventData) {
            if (this.logger.isDebugEnabled()) {
                this.logger.debug("======> sending event " + eventType + " with \n  ======>");
            }
            this._super(eventType, eventData);

        },
        centerToLayers: function (response) {
            var timeout = 500;
            var self=this;
            return Promise.resolve(this.mapWidget).then(function(mapWidget) {

                self.setStatus("__map", "centering map");
                return new Promise(function(resolve, reject) {
                    var timerId;
                    var state = -1;
                    var fcnOnLoad = function() {
                        if (state <= 0) {
                            clearTimeout(timerId);
                            self.logger.debug("map ends loading");
                            mapWidget.removeEventListener('map:load', fcnOnLoad);
                            resolve(response);
                        }
                    };
                    var fcnOnLoading = function() {
                        self.logger.debug("on loading event received while state = ", state);
                        if (state < 0) {
                            state = 0;//loading
                            clearTimeout(timerId);
                            self.logger.debug("waiting for load event");
                        }
                    };
                    mapWidget.addEventListener('map:load', fcnOnLoad);
                    mapWidget.addEventListenerOnce('map:loading', fcnOnLoading);
                    mapWidget.onresize();
                    mapWidget.centerToLayers();
                    mapWidget.map.invalidateSize();
                    logger.debug("invalidated sizes - waiting to start loading");
                    timerId = setTimeout(function() {
                        if (state < 0) {
                            mapWidget.removeEventListenerOnce('map:loading', fcnOnLoading);
                            self.logger.debug("map is not loading ");
                            fcnOnLoad();
                        }
                    }, timeout);

                })
            }).then(
                function(response) { self.setStatus("__map", undefined); return response },
                function(error) { self.setStatus("__map"); throw error }
            )
        }
    });
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