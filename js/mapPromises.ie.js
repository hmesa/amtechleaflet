
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
        init: function (mapWidget, wktParser, parentLogger) {
            this._super();
            var self = this;
            this.__eventCallbacks = {
                onloading: function () {
                    self.setStatus("__map", "loading");
                },
                onload: function () {
                    if (self.getStatus("__map") == "loading") {
                        self.setStatus("__map", undefined);
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
        },
        __addMapListeners: function () {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().addEventListener("map:loading", this.__eventCallbacks.onloading);
                this.getMapWidget().addEventListener("map:load", this.__eventCallbacks.onload);
            }
        },
        __removeMapListeners: function () {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().removeEventListener("map:loading", this.__eventCallbacks.onloading);
                this.getMapWidget().removeEventListener("map:load", this.__eventCallbacks.onload);
            }
        },
        setMapWidget: function (mapWidget) {
            this.__removeMapListeners();
            this.mapWidget = mapWidget;
            this.__addMapListeners();
        },
        getMapWidget: function () {
            return this.mapWidget;
        },
        isMapWidgetSet: function () {
            return typeof this.mapWidget !== "undefined";
        },
        destroy: function () {
            this.__removeMapListeners();

            this.clearImageCache();
            this.imageHandler.destroy();
        },
        labelTemplateChanged: function (newTemplate) {
            if (!newTemplate) {
                this.setLabelTemplateFcn();
            } else {
                this.setLabelTemplateFcn((json) => {
                    return newTemplate.replace(
                        /#\{([^\}]+)\}+/g, (str, arg) => { return json[arg] })
                })
            }
        },
        setLabelTemplateFcn: function (fcn) {
            if (typeof fcn != "function") {
                this.labelTemplateFcn = this.defaultLabelTemplateFcn;
            } else {
                this.labelTemplateFcn = fcn;
            }
        },
        fireEvent: function (eventType, eventData) {
            this.__log("debug", "======> sending event " + eventType + " with \n  ======>"
                + JSON.stringify(eventData, undefined, 2));
            this._super(eventType, eventData);
        },
        //#region Logger
        setParentLogger: function (parentLogger) {
            var handlerLogger = parentLogger;
            var logger = parentLogger;
            if (parentLogger && typeof parentLogger.withFixExecInfo == "function") {
                handlerLogger = parentLogger.withFixExecInfo("ImageHandler", " : ");
                logger = parentLogger.withFixExecInfo("Map promises", " : ");

            }
            this.setLogger(logger);

            this.__handlerLogger = handlerLogger;

            this.imageHandler.setLogger(handlerLogger);

        },
        getLogger: function () {
            return this.logger;
        },
        __log: function () {
            var logger = this.logger;
            var level = Array.prototype.shift.call(arguments);
            if (logger && typeof logger[level] == "function") {
                if (level != "debug" || (typeof logger.isDebugEnabled == "undefined") || logger.isDebugEnabled()) {
                    logger[level].apply(logger, arguments);
                }
            }
        },
        setLogger: function (logger) {
            this.logger = logger;
        },
        //#endregion
        /**/

        //#region dapClient related
        isDapClientSet: function () {
            return typeof this.dapClient != "undefined";
        },
        getDapClient: function () {
            return this.dapClient;
        },
        setDapClient: function (dapClient) {
            this.dapClient = dapClient;
            if (this.dapClient) {
                this.dapClient.setLogger(this.__dapLogger);
            }
            this.getImageHandler().setDapClient(dapClient);
        },
        //#endregion
        /**/

        //#region imageHandler related
        clearImageCache: function () {
            var self = this;
            var promises = [];
            for (var key in this.imageCache) {
                if (this.imageCache.hasOwnProperty(key)) {
                    promises.push(this.imageCache[key].then(
                        function (classData) {
                            self.imageHandler.releaseImage(classData.id);
                        }));
                }
            }

            for (var key in this.floorplanPromises) {
                if (this.floorplanPromises.hasOwnProperty(key) && this.floorplanPromises[key].promise) {
                    promises.push(this.floorplanPromises[key].promise.then(function (response) { self.imageHandler.releaseImage(response); }));
                }
            }
            return Promise.all(promises).finally(function () {
                self.imageCache = {};
                self.floorplanPromises = {};
                self.fireEvent("amtech:class-clear");
            });
        },
        getImageHandler: function () {
            return this.imageHandler;
        },
        //#endregion
        /**/
        clearMap: function () {
            this.clearImageCache();
            this.resourcePromises = {};
            this.proximityAreas = [];
            this.status = {
                __count: 0
            }
            if (this.isMapWidgetSet()) {
                this.getMapWidget().clearMap();
            }
        },
        updateMapElement: function (data) {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().updateElement(data);
            }
        },

        addProximityAreaToMap: function (area) {
            if (this.isMapWidgetSet()) {
                this.getMapWidget().addProximityArea(area);
            }
        },
        //#endregion
        /**/

        //#region Status
        sendErrorMessage: function (errorMessage, details, severity) {
            if (errorMessage && errorMessage.length == 0) {
                var error = {
                    message: errorMessage,
                    details: details,
                    severiy: severity || "error",
                    datetime: new Date()
                }
                this.__log(error.severity, "Error received: \n" + JSON.stringify(error, undefined, 2));
            }
        },
        isIdle: function () {
            return this.status.__count == 0;
        },
        getStatus: function (id) {
            return this.status[id];
        },
        setStatus: function (id, status) {
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
        },
        //#endregion
        /**/

        //#region Promises handling
        __clearPromiseObj: function (promiseObj) {

        },

        getResourcePromiseObj: function (resource, ignoreCache) {
            var self = this;
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
                            .then(function (uri) {
                                self.setStatus(uri, "loading");
                                return dapClient.getResource(uri).then(function (response) {
                                    var data = response;
                                    if (response.contentType) {
                                        data = response.content;
                                    }
                                    return data;
                                });
                            })
                            .then(this.__convertResource.bind(this))
                            .then(function (response) {
                                promiseObj.time = Date.now();
                                return response
                            })
                            .finally(function () {
                                if (self.resourcePromises[resourceUri] == promiseObj) {
                                    self.setStatus(resourceUri, undefined);
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
                promiseObj.promise = promise.catch(function (error) {
                    self.sendErrorMessage("Impossible to retrieve resource " + resourceUri, error.message || error);
                    return undefined;
                });
            }
            if (oldPromise) {
                this.__clearPromiseObj(oldPromise);
            }
            return promiseObj;
        },
        __getResource: function (resource, ignoreCache) {
            return this.__getResourcePromiseObj(resource, ignoreCache).promise;
        },
        __getFloorplanImage: function (resourceUri, params) {
            var self = this;
            var object = this.floorplanPromises[resourceUri];
            var now = Date.now();
            if (!object || (object.time != undefined && now - object.time > this.cacheExpirationTime)) {
                this.setStatus("floorplan_" + resourceUri, "loading image")
                var promise = this.getImageHandler().getImageFromUrl(resourceUri, params);
                object = this.floorplanPromises[resourceUri] = {
                    promise: promise.finally(function () {
                        self.floorplanPromises[resourceUri].time = Date.now();
                        self.setStatus("floorplan_" + resourceUri);
                    }).catch(function (error) {
                        self.floorplanPromises[resourceUri].time -= self.cacheExpirationTime * .9;
                        self.sendErrorMessage("error getting image " + resourceUri,
                            error.statusCode ? "( Code " + error.statusCode + ")" : (error.message || error),
                            "info");
                        return undefined;
                    })
                }
            }
            return object.promise;
        },
        __addProximityArea: function (resource) {
            this.proximityAreas.push(resource);
        },
        __convertResource: function (json) {
            var self = this;

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
                        .finally(function () { self.setStatus(id); })
                        .then(
                            function (classData) {
                                if (!classData) {
                                    return undefined;
                                } else {
                                    self.__log("debug", "loaded image for " + itemType);
                                    var info = {
                                        className: classData.className,
                                        content: classData.content
                                    }
                                    self.fireEvent("amtech:class-updated", info);
                                    return classData;
                                }
                            },
                            function (error) {
                                self.sendErrorMessage("Error loading image for " + itemType,
                                    error.message || error || "", "debug");
                                return undefined;
                            }
                        );
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
                                .then(function (response) {
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
        },
        __processElement: function (data) {
            this.setStatus(data["@id"], "adding to map");
            this.updateMapElement(data);
            return data;
        },
        __processProximityArea: function (data) {
            this.setStatus(data["@id"], "adding as proximity area");
            this.addProximityAreaToMap(data);
            return data;
        },
        addElements: function (list) {
            var self = this;
            return this.__processElementList(list, this.__processElement, this).then(function (response) {
                self.__addProximityAreas();
                return response;
            });
        },
        addElement: function (elem) {
            return this.addElements([elem])
        },
        putElement: function (elem) {
            var self = this;
            if (!elem) {
                return Promise.reject("Trying to update an invalid resource");
            }
            var resourceUrl = elem["@id"];
            if (!resourceUrl) {
                return Promise.reject("Missing uri on resource " + JSON.stringify(elem))
            }
            this.setStatus(resourceUrl, "loading");
            return this.dapClient.putResource(elem)
                .then(() => { return self.__getResource(resourceUrl, true) })
                .then(this.addElement.bind(this))
                .finally(
                    () => { self.setStatus(resourceUrl, undefined); }
                );

        },
        addQueryResults: function (queryUrl, params) {
            var self = this;

            var dapClient = this.getDapClient();
            if (!dapClient) {
                this.sendErrorMessage("Dap client not initialized. Verify configuration");
                return Promise.resolve();
            } else {
                this.setStatus(queryUrl, "loading");
                return dapClient.getQueryResults(queryUrl, params)
                    .then(function (response) {
                        self.setStatus(queryUrl, "processing elements");
                        if (self.logger.isDebugEnabled()) {
                            self.__log("debug", JSON.stringify(response, [], 2));
                        }
                        return response;
                    })
                    .then(this.addElements.bind(this))
                    .finally(
                        function () { self.setStatus(queryUrl, undefined); }
                    ).catch(function (error) {
                        self.sendErrorMessage("Error requesting query results for " + queryUrl, error.message || error, "error")
                    });
            }
        },
        __processElementList: function (list, callback, context) {
            var self = this;
            if (!Array.isArray(list)) {
                var error = new Error("Expecting a list of elements");
                return Promise.reject(error);
            }
            for (var i = 0; i < list.length; i++) {
                if (typeof list[i] != "string") {
                    var obj = this.__getResource(list[i]);
                    list[i] = list[i]['@id'] || '';
                }
            }
            var elemPromises = list.map(function (item) {
                var promiseObj = self.__getResource(item);
                return promiseObj.then(function (response) {
                    return callback.call(context, response)
                }).finally(
                    function () { self.setStatus(item, undefined); }
                ).catch(function (error) {
                    self.sendErrorMessage("Error getting resource ", error.message || error);
                });
            });
            return Promise.all(elemPromises);
        },
        __addProximityAreas: function () {
            if (this.proximityAreas && this.proximityAreas.length > 0) {
                return this.__processElementList(
                    this.proximityAreas,
                    this.__processProximityArea,
                    this
                );
            } else {
                return Promise.resolve([]);
            }

        },
        centerToLayers: function (response) {
            var timeout = 1000;
            var self = this;
            return Promise.resolve(this.getMapWidget()).then(function (mapWidget) {
                if (!mapWidget) {
                    return Promise.resolve();
                }
                self.setStatus("__map", "centering map");
                return new Promise(function (resolve, reject) {
                    var timerId;
                    var state = -1;
                    var fcnOnLoad = function () {
                        if (state <= 0) {
                            clearTimeout(timerId);
                            self.__log("debug", "map ends loading");
                            mapWidget.removeEventListenerOnce('map:load', fcnOnLoad);
                            resolve(response);
                        }
                    };
                    var fcnOnLoading = function () {
                        self.__log("debug", "on loading event received while state = ", state);
                        if (state < 0) {
                            state = 0;//loading
                            clearTimeout(timerId);
                            self.__log("waiting for load event");
                        }
                    };
                    mapWidget.addEventListenerOnce('map:load', fcnOnLoad);
                    mapWidget.addEventListenerOnce('map:loading', fcnOnLoading);
                    mapWidget.centerToLayers();
                    mapWidget.map.invalidateSize();
                    self.__log("debug", "invalidated sizes - waiting to start loading");
                    timerId = setTimeout(function () {
                        if (state < 0) {
                            mapWidget.removeEventListenerOnce('map:loading', fcnOnLoading);
                            self.__log("debug", "map is not loading ");
                            fcnOnLoad();
                        }
                    }, timeout);

                });
            }).finally(
                function () { self.setStatus("__map", undefined); }
            );
        }
        //#endregion
        /**/
    });
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