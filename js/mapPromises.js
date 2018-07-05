
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
        constructor(mapWidget, wktParser, parentLogger) {
            super();
            this.__eventCallbacks = {
                onloading: () => {
                    this.setStatus("__map", "loading");
                },
                onload: () => {
                    if (this.getStatus("__map") == "loading") {
                        this.setStatus("__map", undefined);
                    }
                }
            }
            this.setMapWidget(mapWidget);
            this.dapClient = undefined;
            this.imageCache = {};
            this.clearMap();
            this.cacheExpirationTime = 3600000;//1h
            this.defaultLabelTemplateFcn = (json) => {
                return json.shortName || json._name || json["@id"];
            }
            this.wktValidationFunction = function (wkt) { return true }
            if (wktParser && wktParser.isValidWkt) {
                this.wktValidationFunction = wktParser.isValidWkt;
            }
            this.imageHandler = new ImageHandler();
            this.setParentLogger(parentLogger);

            this.__addMapListeners();
        }
        __addMapListeners() {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().addEventListener("map:loading", this.__eventCallbacks.onloading);
                this.getMapWidget().addEventListener("map:load", this.__eventCallbacks.onload);
            }
        }
        __removeMapListeners() {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().removeEventListener("map:loading", this.__eventCallbacks.onloading);
                this.getMapWidget().removeEventListener("map:load", this.__eventCallbacks.onload);
            }
        }
        setMapWidget(mapWidget) {
            this.__removeMapListeners();
            this.mapWidget = mapWidget;
            this.__addMapListeners();
        }
        getMapWidget() {
            return this.mapWidget;
        }
        isMapWidgetSet() {
            return typeof this.mapWidget !== "undefined";
        }
        destroy() {
            this.__removeMapListeners();

            this.clearImageCache();
            this.imageHandler.destroy();
        }
        labelTemplateChanged(newTemplate) {
            if (!newTemplate) {
                this.setLabelTemplateFcn();
            } else {
                this.setLabelTemplateFcn((json) => {
                    return newTemplate.replace(
                        /#\{([^\}]+)\}+/g, (str, arg) => { return json[arg] })
                })
            }
        }
        setLabelTemplateFcn(fcn) {
            if (typeof fcn != "function") {
                this.labelTemplateFcn = this.defaultLabelTemplateFcn;
            } else {
                this.labelTemplateFcn = fcn;
            }
        }
        fireEvent(eventType, eventData) {
            this.__log("debug", "======> sending event " + eventType + " with \n  ======>"
                + JSON.stringify(eventData, undefined, 2));
            super.fireEvent(eventType, eventData);
        }

        //#region Logger
        setParentLogger(parentLogger) {
            var handlerLogger = parentLogger;
            var logger = parentLogger;
            if (parentLogger && typeof parentLogger.withFixExecInfo == "function") {
                handlerLogger = parentLogger.withFixExecInfo("ImageHandler", " : ");
                logger = parentLogger.withFixExecInfo("Map promises", " : ");

            }
            this.setLogger(logger);

            this.__handlerLogger = handlerLogger;

            this.imageHandler.setLogger(handlerLogger);

        }
        getLogger() {
            return this.logger;
        }
        __log() {
            var logger = this.logger;
            var level = Array.prototype.shift.call(arguments);
            if (logger && typeof logger[level] == "function") {
                if (level != "debug" || (typeof logger.isDebugEnabled == "undefined") || logger.isDebugEnabled()) {
                    logger[level].apply(logger, arguments);
                }
            }
        }
        setLogger(logger) {
            this.logger = logger;
        }
        //#endregion
        /**/

        //#region dapClient related
        getDapClient() {
            if (!this.dapClient) {
                this.createDapClient();
            }
            return this.dapClient;
        }
        setDapClient(dapClient) {
            this.dapClient = dapClient;
            if (this.dapClient) {
                this.dapClient.setLogger(this.__dapLogger);
            }
            this.getImageHandler().setDapClient(dapClient);
        }
        //#endregion
        /**/

        //#region imageHandler related
        clearImageCache() {
            var promises = [];
            for (var key in this.imageCache) {
                if (this.imageCache.hasOwnProperty(key)) {
                    promises.push(this.imageCache[key].then(
                        (classData) => {
                            this.imageHandler.releaseImage(classData.id);
                        }));
                }
            }

            for (var key in this.floorplanPromises) {
                if (this.floorplanPromises.hasOwnProperty(key) && this.floorplanPromises[key].promise) {
                    promises.push(this.floorplanPromises[key].promise.then((response) => { this.imageHandler.releaseImage(response); }));
                }
            }
            return Promise.all(promises).finally(() => {
                this.imageCache = {};
                this.floorplanPromises = {};
                this.fireEvent("amtech:class-clear");
            });
        }
        getImageHandler() {
            return this.imageHandler;
        }
        //#endregion
        /**/

        //#region Map handler 
        clearMap() {
            this.clearImageCache();
            this.resourcePromises = {};
            this.proximityAreas = [];
            this.status = {
                __count: 0
            }
            if (this.isMapWidgetSet()) {
                this.getMapWidget().clearMap();
            }
        }
        updateMapElement(data) {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().updateElement(data);
            }
        }

        addProximityAreaToMap(area) {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().addProximityArea(area);
            }
        }
        //#endregion
        /**/

        //#region Status
        sendErrorMessage(errorMessage, details, severity) {
            if (errorMessage && errorMessage.length == 0) {
                var error = {
                    message: errorMessage,
                    details: details,
                    severiy: severity || "error",
                    datetime: new Date()
                }
                this.__log(error.severity, "Error received: \n" + JSON.stringify(error, undefined, 2));
            }
        }
        isIdle() {
            return this.status.__count == 0;
        }
        getStatus(id) {
            return this.status[id];
        }
        setStatus(id, status) {
            this.__log("debug", "setting status of " + id + " to " + status);
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
        //#endregion
        /**/

        //#region Promises handling
        __clearPromiseObj(promiseObj) {

        }
        __getResourcePromiseObj(resource, ignoreCache) {
            var resourceUri = resource;
            var promiseObj;
            var promise = undefined;
            var returnedPromise;
            var dapClient = this.getDapClient();
            var oldPromise = undefined;
            var isCreated = false;
            if (!dapClient) {
                promise = Promise.reject(new Error("Dap client not initialized"));
            } else {
                if (typeof resource != "string") {
                    //retrieved a json so it is taken as real resource forever
                    resourceUri = resource["@id"];
                    promise = Promise.resolve(resource)
                        .then(this.__convertResource.bind(this));
                    promiseObj = { time: Infinity, promise: promise };
                    oldPromise = this.resourcePromises[resourceUri];
                    this.resourcePromises[resourceUri] = promiseObj;
                    isCreated = true;

                } else if (resource.length > 0) {
                    //we received the url
                    var promiseObj = this.resourcePromises[resourceUri];
                    var now = Date.now();

                    if (ignoreCache || typeof promiseObj == "undefined" || !promiseObj.promise ||
                        (!promiseObj.computing && (
                            (typeof promiseObj.time == "undefined") ||
                            (now - promiseObj.time > this.cacheExpirationTime)
                        ))) {
                        oldPromise = promiseObj;
                        this.resourcePromises[resourceUri] = promiseObj = { computing: true };
                        promise = Promise.resolve(resourceUri)
                            .then((uri) => {
                                this.setStatus(uri, "loading");
                                return dapClient.getResource(uri).then((response) => {
                                    var data = response;
                                    if (response.contentType) {
                                        data = response.content;
                                    }
                                    return data;
                                });
                            })
                            .then(this.__convertResource.bind(this))
                            .then((response) => {
                                promiseObj.time = Date.now();
                                return response
                            })
                            .finally(() => {
                                if (this.resourcePromises[resourceUri] == promiseObj) {
                                    this.setStatus(resourceUri, undefined);
                                }
                                delete promiseObj.computing;
                            });

                        isCreated = true;
                    }
                } else {
                    promise = Promise.reject(new Error("Invalid resource uri: '" + resourceUri + "'"));
                }
            }
            if (isCreated) {
                promiseObj.promise = promise.catch((error) => {
                    this.sendErrorMessage("Impossible to retrieve resource " + resourceUri, error.message || error);
                    return undefined;
                });
            }
            if (oldPromise) {
                this.__clearPromiseObj(oldPromise);
            }
            return promiseObj;
        }
        __getResource(resource, ignoreCache) {
            return this.__getResourcePromiseObj(resource, ignoreCache).promise;
        }
        __getFloorplanImage(resourceUri, params) {
            var object = this.floorplanPromises[resourceUri];
            var now = Date.now();
            if (!object || (object.time != undefined && now - object.time > this.cacheExpirationTime)) {
                this.setStatus("floorplan_" + resourceUri, "loading image")
                var promise = this.getImageHandler().getImageFromUrl(resourceUri, params);
                object = this.floorplanPromises[resourceUri] = {
                    promise: promise.finally(() => {
                        this.floorplanPromises[resourceUri].time = Date.now();
                        this.setStatus("floorplan_" + resourceUri);
                    }).catch((error) => {
                        this.floorplanPromises[resourceUri].time -= this.cacheExpirationTime * .9;
                        this.sendErrorMessage("error getting image " + resourceUri,
                            error.statusCode ? "( Code " + error.statusCode + ")" : (error.message || error),
                            "info");
                        return undefined;
                    })
                }
            }
            return object.promise;
        }
        __addProximityArea(resource) {
            this.proximityAreas.push(resource);
        }
        __convertResource(json) {

            var url = json['@id'] || '';
            var itemType = json['@type'] || '';
            var error;
            if (!url || !itemType) {
                error = new Error("resource without url or type");
            } else if (!itemType.startsWith(window.CONSTANTS.PATHS.TYPE_ENTITY)) {
                error = new Error("Only entities can be represented ");
            }
            if (error) {
                error.statusCode = STATUS_CODES.BadRequest.code;
                throw error;

            }
            this.setStatus(url, "converting");
            var imageHandler = this.getImageHandler();
            var iconClass = imageHandler.getImageCssClassName(itemType);
            var data = {
                "@id": url,
                _name: json._name,
                description: json.description,
                location: json.location,
                proximityarea: json.proximityarea,
                icon: iconClass,
                iconUrl: itemType,
                shortName: url.replace(window.CONSTANTS.PATHS.ENTITIES + "/", "")
            };
            if (typeof this.labelTemplateFcn == "function") {
                json.shortName = data.shortName;
                data.label = this.labelTemplateFcn(json);
            }
            var iconData;

            if (this.isMapWidgetSet()) {
                var mapWidget = this.getMapWidget();

                data.iconUrl = itemType;
                if (!this.imageCache[itemType]) {
                    var id = "image_" + itemType;
                    this.setStatus(id, "loading");
                    this.imageCache[itemType] = imageHandler.setClassForUrl(itemType, iconClass, true)
                        .finally(() => { this.setStatus(id); })
                        .then(
                            (classData) => {
                                if (!classData) {
                                    return undefined;
                                } else {
                                    this.__log("debug", "loaded image for " + itemType);
                                    let info = {
                                        className: classData.className,
                                        content: classData.content
                                    }
                                    this.fireEvent("amtech:class-updated", info);
                                    return classData;
                                }
                            },
                            (error) => {
                                this.sendErrorMessage("Error loading image for " + itemType,
                                    error.message || error || "", "debug");
                                return undefined;
                            }
                        )
                }
                iconData = this.imageCache[itemType];
                var locationData = json['location'];
                var locationJson;
                try {
                    locationJson = mapWidget.fromOldLocation(locationData || '{}');
                } catch (e) {
                    this.__log("error", "locationJson", e);
                }

                if (!locationJson) {
                    this.__log("info", "Invalid location on resource " + url);
                } else if (locationJson.wkt && locationJson.wkt.length > 0 && !this.wktValidationFunction(locationJson.wkt)) {
                    // error with thing location wkt
                    this.__log("info", "Invalid wkt on resource " + url + ". WKT=" + locationJson.wkt);
                } else {
                    data.locationJson = locationJson;
                    data.location = locationJson.wkt;

                    var floorplan = json['floorplan'];
                    var floorplanJson = undefined;
                    if (floorplan && floorplan.location) {

                        var floorplanLocationJson = undefined;
                        var e;
                        try {
                            floorplanLocationJson = mapWidget.fromOldLocation(floorplan.location);
                            if (!floorplanLocationJson) {
                                this.__log("info", "Invalid location on floorplan calibration " + url);
                            }
                        } catch (e) {
                            this.__log("info", "Invalid floorplan location for resource " + resourceUri, e);
                        }
                        if (floorplanLocationJson && floorplanLocationJson.wkt && floorplanLocationJson.wkt.length > 0 && !this.wktValidationFunction(floorplanLocationJson.wkt)) {
                            // error with thing location wkt
                            this.__log("info", "Invalid location on floorplan calibration for " + url + ". WKT=" + floorplanLocationJson.wkt);
                            floorplanLocationJson.wkt = "";
                        }

                        var imageUrl = floorplan["imageurl"] || '';
                        data.floorplan = {
                            location: floorplanLocationJson,
                            imageurl: ''
                        }
                        if (imageUrl.length > 0) {
                            var floorplanPromise = this.__getFloorplanImage(imageUrl)
                                .then((response) => {
                                    if (response && !(response instanceof Error)) {
                                        data.floorplan.imageurl = response;
                                        if (mapWidget.hasElement(url)) {
                                            mapWidget.updateElement({
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
            } else {
                this.sendErrorMessage("The map is not ready", "", "warn")
            }

            return data;
        }
        __processElement(data) {
            this.setStatus(data["@id"], "adding to map");
            this.updateMapElement(data);
            return data;
        }
        __processProximityArea(data) {
            this.setStatus(data["@id"], "adding as proximity area");
            this.addProximityAreaToMap(data);
            return data;
        }
        addElements(list) {
            return this.__processElementList(list, this.__processElement, this).then((response) => {
                this.__addProximityAreas();
                return response;
            });
        }
        addElement(elem) {
            return this.addElements([elem])
        }
        putElement(elem) {
            if (!elem) {
                return Promise.reject("Trying to update an invalid resource");
            }
            var resourceUrl = elem["@id"];
            if (!resourceUrl) {
                return Promise.reject("Missing uri on resource " + JSON.stringify(elem))
            }
            this.setStatus(resourceUrl, "loading");
            return this.dapClient.putResource(elem)
                .then(() => { return this.__getResource(resourceUrl, true) })
                .then(this.addElement.bind(this))
                .finally(
                    () => { this.setStatus(resourceUrl, undefined); }
                );

        }
        addQueryResults(queryUrl, params) {

            var dapClient = this.getDapClient();
            if (!dapClient) {
                this.sendErrorMessage("Dap client not initialized. Verify configuration");
                return Promise.resolve();
            } else {
                this.setStatus(queryUrl, "loading");
                return dapClient.getQueryResults(queryUrl, params)
                    .then((response) => {
                        this.setStatus(queryUrl, "processing elements");
                        this.__log("debug", JSON.stringify(response, [], 2));

                        return response;
                    })
                    .then(this.addElements.bind(this))
                    .finally(
                        () => { this.setStatus(queryUrl, undefined); }
                    ).catch((error) => {
                        this.sendErrorMessage("Error requesting query results for " + queryUrl, error.message || error, "error")
                    });
            }
        }
        __processElementList(list, callback, context) {
            if (!Array.isArray(list)) {
                var error = new Error("Expecting a list of elements");
                return Promise.reject(error);
            }
            for (var i = 0; i < list.length; i++) {
                if (typeof list[i] != "string") {
                    let obj = this.__getResource(list[i]);
                    list[i] = list[i]['@id'] || '';
                }
            }
            var elemPromises = list.map((item) => {
                let promiseObj = this.__getResource(item);
                return promiseObj.then((response) => {
                    return callback.call(context, response)
                }).finally(
                    () => { this.setStatus(item, undefined); }
                ).catch((error) => {
                    this.sendErrorMessage("Error getting resource ", error.message || error);
                });
            });
            return Promise.all(elemPromises);
        }
        __addProximityAreas() {
            if (this.proximityAreas && this.proximityAreas.length > 0) {
                return this.__processElementList(
                    this.proximityAreas,
                    this.__processProximityArea,
                    this
                );
            } else {
                return Promise.resolve([]);
            }

        }
        centerToLayers(response) {
            var timeout = 1000;
            return Promise.resolve(this.getMapWidget()).then((mapWidget) => {
                if (!mapWidget) {
                    return Promise.resolve();
                }
                this.setStatus("__map", "centering map");
                return new Promise((resolve, reject) => {
                    var timerId;
                    var state = -1;
                    var fcnOnLoad = () => {
                        if (state <= 0) {
                            clearTimeout(timerId);
                            this.__log("debug", "map ends loading");
                            mapWidget.removeEventListenerOnce('map:load', fcnOnLoad);
                            resolve(response);
                        }
                    };
                    var fcnOnLoading = () => {
                        this.__log("debug", "on loading event received while state = ", state);
                        if (state < 0) {
                            state = 0;//loading
                            clearTimeout(timerId);
                            this.__log("debug", "waiting for load event");
                        }
                    };
                    mapWidget.addEventListenerOnce('map:load', fcnOnLoad);
                    mapWidget.addEventListenerOnce('map:loading', fcnOnLoading);
                    mapWidget.centerToLayers();
                    mapWidget.map.invalidateSize();
                    this.__log("debug", "invalidated sizes - waiting to start loading");
                    timerId = setTimeout(() => {
                        if (state < 0) {
                            mapWidget.removeEventListenerOnce('map:loading', fcnOnLoading);
                            this.__log("debug", "map is not loading ");
                            fcnOnLoad();
                        }
                    }, timeout);

                })
            }).finally(
                () => { this.setStatus("__map", undefined); }
            )
        }
        //#endregion
        /**/
    }
    var createMapPromises = function (mapWidget, wktParser, logger) {
        return new MapPromises(mapWidget, wktParser, logger);
    }
    if (typeof module !== "undefined") {
        module.exports = {
            createMapPromises: createMapPromises
        }


    } else {
        window.createMapPromises = createMapPromises;
    }
})(this);