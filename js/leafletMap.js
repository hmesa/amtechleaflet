/*
 *  Copyright (c) 2014-2014 amTech
 *  *
 *  * This is subject to the terms and conditions defined in file 'LICENSE',
 *  * which is part of this source code package.
 */
(function (global) {
    "use strict";
    var L = global.L;
    var amtech = global.amtech;
    var wktParser = global.wktParser;
    if (!amtech.I18N) {
        amtech.I18N = {};
    }
    if (!amtech.I18N.MAP) {
        amtech.I18N.MAP = {
            'NoUrlGiven': "Missing url",
            'MapNotReady': "The map is not ready yet",
            'NoSelected': "No resource selected",
            'NoLocationGiven': "No location given for resource",
            'InvalidGeometry': "Invalid geometry {0}",
            'UnknownEntity': "Unknown resource {0}",
            'LocateMe': "Detect my position",
            'contributors': "contributors",

            'ProximityAreas': "Proximity areas",
            'Timeline': "Timeline",
            'Things': "Things",
            'Floorplans': "Floorplans",

            'ZoomIn': "Zoom in",
            'ZoomOut': "Zoom out"
        };
    }
    function getMessage() {
        var args = arguments;
        var id = Array.prototype.shift.call(args);
        var string = (amtech.I18N.MAP[id] || id);
        if (args.length > 0) {
            return String.prototype.format.apply(string, args);
        } else {
            return string;
        }
    }
    amtech.console.widget.LeafletMap = amtech.console.widget.BaseWidget.extend({

        _defaults: {
            containerElement: null,

            //visualization
            resizeDelay: 100,
            overlayOpacity: 0.5,
            labelTemplate: undefined,

            //interaction
            center: [0, 0],
            zoom: 19,
            maxZoomForCentering: 20,
            active: '',

            canSelect: true,
            onchange: null,
            onselectionchange: null,
            onviewchange: null,

            //animations
            animations: false,
            markerZoomAnimation: false,
            zoomAnimation: false,
            fadeAnimation: false,
            logger: console,

            //tilelayer
            tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            tileLayerOptions: {
                minNativeZoom: 3,
                maxNativeZoom: 19,
                minZoom: 3,
                maxZoom: 25,
                attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> '
                    + (getMessage("contributors"))
            },

            //controls
            spiderfy: true,
            allowUserInteractionOnCoordinates: false,
            withLocateMeControl: false,
            withResizerControl: false,
            withLayerControl: false,
            withCoordinateControl: false,
            withZoomControl: true,
            withLinkSearchControl: false,

            __showLabels:false,
            permanentLabels:false
        },
        init: function (cfg) {
            this.initConstants();
            this._super(cfg);
            this.hide();

            this.__resourcesStillLoading = { __size: 0 };
            this.createBaseLayers();

            this.bindEvents();
            if (!this.cfg.delayedCreation) {
                this.createMap();
            }
            this._selectedElement = undefined;
            this._elements = {};
            this._proximityAreas = {};
            this._mapSize = [0, 0];

        },
        verifyCfg: function (cfg) {
            cfg = this._super(cfg);

            if (typeof cfg.center === "string") {
                var string = cfg.center;
                cfg.center = [];
                string.split(",").forEach(function (item) {
                    cfg.center.push(parseFloat(item))
                });
                if (cfg.center.length != 2) {
                    cfg.center = undefined;
                }
            }
            if (typeof cfg.permanentLabels=="number"){
                cfg.permanentLabels=[cfg.permanentLabels,undefined];
            }else if(Array.isArray(cfg.permanentLabels)){
                if (cfg.permanentLabels.length==0){
                    cfg.permanentLabels=true;

                }else if(cfg.permanentLabels.length==1){
                    cfg.permanentLabels.push(undefined);
                }
            }
            for (var key in this._defaults) {
                if (typeof cfg[key] === "undefined") {
                    cfg[key] = this._defaults[key];
                }
            }
            var attributionAmtech = '<a href="http://www.amtech.solutions" title="Activity Monitoring Technology">AMTech</a>';
            var options = cfg.tileLayerOptions;
            if (typeof options.attribution != "undefined") {
                options.attribution += (' | ' + attributionAmtech);
            } else {
                options.attribution = attributionAmtech;
            }

            var isOnControlSettings = [
                [this.CONTROLS.LOCATEME, "withLocateMeControl"],
                [this.CONTROLS.RESIZER, "withResizerControl"],
                [this.CONTROLS.LAYER, "withLayerControl"],
                [this.CONTROLS.COORDINATE, "withCoordinateControl"],
                [this.CONTROLS.ZOOM, "withZoomControl"],
                [this.CONTROLS.EDIT_STATE, "withEditStateControl"],
                [this.CONTROLS.LINK_SEARCH, "withLinkSearchControl"]
            ];
            var self = this;
            isOnControlSettings.forEach(function (keyValue) {
                self[self._getControlId(keyValue[0]) + "_isShown"] = cfg[keyValue[1]];
            });
            return cfg;

        },
        initConstants: function () {

            this.CONTROLS = {
                AMTECH: "Amtech",
                LOCATEME: "locateMySelf",
                ZOOM: "zoom",
                RESIZER: "containerResizer",
                LAYER: "layer",
                COORDINATE: "coordinate",
                LINK_SEARCH: "linkSearch",
            };
            this.EVENTS = {
                SELECTION_CHANGE: "map:selectionchange",
                CLICK: "map:elementclick",
                CHANGE: "map:change",
                VIEW_CHANGE: "map:viewchange",
                CONTAINER_RESIZE: "map:containerresize",
                LOAD: "map:load",
                LOADING: "map:loading",
                LOCATION_FOUND: "map:locationfound",
                LOCATION_ERROR: "map:locationerror",
                ERROR: "map:error"
            };
            this.STYLES = {
                MARKER_ICON: "map-icon-marker",
                FILL: "map-fill",
                LINE: "map-line",
                ALL: "map-all-items",
                PROXIMITY_AREA: "map-proximity-area-items",
                SELECTED: "map-selected-items",
                HOVER: "map-item-hover",
                LABEL: "map-item-label",
                POPUP: "map-popup",
                POPUP_TEXT: "map-popup-text",

                MAP_CONTAINER_PANEL: "map-container-panel",

                TIMELINE: "map-timeline",
                TIMELINE_PATH: "map-timeline-path"
            }
        },

        getIcon: function (data, defaultOptions) {
            var icon;

            var iconClass = data.icon || '';
            var iconOptions = {
                className: defaultOptions.className || '',
                html: '<div class="map-icon ' + iconClass + '">&nbsp;</div>',
                iconSize: null, // size of the icon
                iconAnchor: null, // point of the icon which will
                // correspond to marker's location
                popupAnchor: defaultOptions.popupAnchor || [-3, -27]
                // point from which the popup should open relative to the
                // iconAnchor
            };
            icon = L.divIcon(iconOptions);

            return icon;
        },
        resourceLoadStart: function (resourceId) {
            if (resourceId) {
                if (this.__resourcesStillLoading[resourceId]) {
                    this.logger.warn("the resource could be already loading")
                } else {
                    if (this.__resourcesStillLoading.__size == 0) {
                        this.fireEvent(this.EVENTS.LOADING, { src: this });

                    }
                    this.__resourcesStillLoading[resourceId] = true;
                    this.__resourcesStillLoading.__size++;
                }
                var self = this;
                return function () { self.resourceLoadEnd(resourceId) };
            }
        },
        resourceLoadEnd: function (resourceId) {
            if (!resourceId) {
                return;
            }
            if (!this.__resourcesStillLoading[resourceId]) {
                this.logger.debug("resource " + resourceId + " is not being loaded");
            } else {
                delete this.__resourcesStillLoading[resourceId];
                this.__resourcesStillLoading.__size--;
                if (this.__resourcesStillLoading.__size == 0) {
                    this.fireEvent(this.EVENTS.LOAD);
                }
            }
        },
        createMap: function () {
            // console.log("initializing map");
            this.create();
            this.setTileLayer();
            this.resetView();
            this.registerLocationEventCallbacks();
            this.registerViewChangeCallbacks();
        },
        registerLocationEventCallbacks: function () {
            this.map.on('locationerror', this.onLocationError, this);
            this.map.on('locationfound', this.onLocationFound, this);

        },
        onLocationFound: function (eventData) {
            // eventData of type LocationEvent
            this.logger.debug("self location succeded");
            if (this.__mustCenterAfterLocation) {
                if (this.isShown()) {
                    // this.setCurrentCenterCoords(eventData.longitude,
                    // eventData.latitude);
                    this.setView(eventData.latitude, eventData.longitude, 10);
                }
            }
            this.__mustCenterAfterLocation = false;

            this.fireEvent(this.EVENTS.LOCATION_FOUND, [eventData.latitude, eventData.longitude]);
        },
        onLocationError: function (eventData) { // eventData of type
            // ErrorEvent

            this.logger.warn('error locating user: ');
            this.logger.debug(eventData);
            if (this.__mustCenterAfterLocation) {
                if (this.isShown()) {
                    this.setView(0, 0, this.map.getBoundsZoom([[-85, -120], [85, 120]], true));
                }
            }
            this.__mustCenterAfterLocation = false;
            this.fireEvent(this.EVENTS.LOCATION_ERROR, eventData);

        },
        getIsLatLng: function () {
            return false;
        },
        bindEvents: function () {
            if (this.cfg.onchange != null && this.cfg.onchange.length > 0) {
                this
                    .addEventListener(this.EVENTS.CHANGE,
                        this.cfg.onchange);
            }
            if (this.cfg.onselectionchange != null
                && this.cfg.onselectionchange.length > 0) {
                this.addEventListener(this.EVENTS.SELECTION_CHANGE,
                    this.cfg.onselectionchange);
            }
            if (this.cfg.onElementClick != null
                && this.cfg.onElementClick.length > 0) {
                this.addEventListener(this.EVENTS.CLICK,
                    this.cfg.onElementClick);
            }
            if (this.cfg.onviewchange != null
                && this.cfg.onviewchange.length > 0) {
                this.addEventListener(this.EVENTS.VIEW_CHANGE,
                    this.cfg.onviewchange);

            }
        },
        setOnViewChangeNotificationHandler: function (onChangeNotificationsFcn) {
            var is = this.isChangeNotificationsActivated();
            this.toggleChangeNotificationsActivated(false);

            this.cfg.onChangeNotificationsFcn = onChangeNotificationsFcn;
            if (is) {
                this.toggleChangeNotificationsActivated(true);
            }
        },
        isChangeNotificationsActivated: function () {
            return this._isChangeNotificationsActivated || false;
        },
        toggleChangeNotificationsActivated: function (bool) {
            if (typeof bool == "undefined") {
                bool = !this.isChangeNotificationsActivated();
            } else if (bool == this.isChangeNotificationsActivated()) {
                return;
            }
            this._isChangeNotificationsActivated = bool;
            this.fireOnChangeNotificationsChanged();
        },
        fireOnChangeNotificationsChanged: function () {
            if (typeof this.cfg.onChangeNotificationsFcn == "function") {
                this.cfg.onChangeNotificationsFcn(this.isChangeNotificationsActivated());
            }

        },
        setTileLayer: function () {
            if (this.map) {
                // L.tileLayer.fallback(this.cfg.tileLayer,
                // this.cfg.tileLayerOptions).addTo(this.map);
                var tilelayer = L.tileLayer(this.cfg.tileLayer,
                    this.cfg.tileLayerOptions).addTo(this.map);
                tilelayer.on("loading", function () {
                    var onLoad = this.resourceLoadStart("tilelayer");
                    tilelayer.once("load", onLoad);

                }, this);
            }
        },
        hide: function () {
            this._mapHidden = true;
            this._mapSize = [0, 0];
        },
        show: function () {
            this._mapHidden = false;
            if (this.map) {
                this.onresize().centerToLayers();
            }
        },
        isShown: function () {
            return !this._mapHidden;
        },
        getDefaultCenter: function () {
            if (this.cfg.center == null && this.verifyMap()) {
                this.cfg.center = this.getCurrentCenterCoords();
            }
            return this.cfg.center;
        },
        getLayerBounds: function (layer) {
            if (layer._map || (!(layer instanceof L.Marker) && !(layer instanceof L.Circle))) {
                return layer.getBounds();
            } else if (layer instanceof L.Marker) {
                return L.latLngBounds([layer.getLatLng(), layer.getLatLng()]);
            } else if (layer instanceof L.Circle) {
                return L.latLngBounds([layer.getLatLng(), layer.getLatLng()]);
            } else {
                return layer.getBounds();
            }
        },
        centerToLayer: function (layer) {
            var bounds = this.getLayerBounds(layer);
            this.map.fitBounds(bounds, {
                padding: [10, 10],
                maxZoom: this.cfg.maxZoomForCentering,
                minZoom: 5
            });
        },
        centerToLayers: function () {
            if (!this.verifyMap()) {
                return this;
            }
            var allLayers = [];
            var self = this;
            if (this.layerProximityAreas.getLayers().length > 0) {
                allLayers.push(this.layerProximityAreas);
            }
            if (this.layerAllItems.getLayers().length > 0) {
                allLayers.push(this.layerAllItems);
            }
            if (this.layerActiveItems.getLayers().length > 0) {
                allLayers.push(this.layerActiveItems);
            }
            if (this.layerTimeline.getLayers().length > 0) {
                allLayers.push(this.layerTimeline);
            }
            if (allLayers.length > 0 || this.layerFloorplans.getLayers().length > 0) {
                var delta_lat = .001, delta_lng = .001, s = 90, w = 180, n = -90, e = -180;

                this.logger.info("MAP:  stopping user location");
                this.__mustCenterAfterLocation = false;
                this.map.stopLocate();

                allLayers.forEach(function (layer) {
                    var bounds = self.getLayerBounds(layer);
                    if (bounds.isValid()) {
                        if (s > bounds.getSouth()) {
                            s = bounds.getSouth();
                        }
                        if (w > bounds.getWest()) {
                            w = bounds.getWest();
                        }
                        if (n < bounds.getNorth()) {
                            n = bounds.getNorth();
                        }
                        if (e < bounds.getEast()) {
                            e = bounds.getEast();
                        }
                    }
                });
                this.layerFloorplans.getLayers().forEach(function (layer) {
                    var bounds = layer._bounds;
                    if (bounds.isValid()) {
                        if (s > bounds.getSouth()) {
                            s = bounds.getSouth();
                        }
                        if (w > bounds.getWest()) {
                            w = bounds.getWest();
                        }
                        if (n < bounds.getNorth()) {
                            n = bounds.getNorth();
                        }
                        if (e < bounds.getEast()) {
                            e = bounds.getEast();
                        }
                    }
                })
                if (s == n) {
                    s -= delta_lat;
                    n += delta_lat;
                }
                if (e == w) {
                    w -= delta_lng;
                    e += delta_lng;
                }
                if (w < -180) {
                    w = -180;
                }
                if (e > 180) {
                    e = 180;
                }

                this.map.fitBounds([[s, w], [n, e]], {
                    padding: [10, 10],
                    maxZoom: this.cfg.maxZoomForCentering,
                    minZoom: 1
                });
                this.logger.info("MAP:  fitting the layers")
            } else {
                try {
                    this.logger.info("MAP:  locating user");
                    this.__mustCenterAfterLocation = true;
                    this.map.locate({
                        setView: false,
                        maxZoom: 15,
                        maximumAge: 60000
                    });// one minute

                } catch (e) {
                    this.logger.debug('Could not locate the user. Error message: ' + JSON.stringify(e));
                    this.__mustCenterAfterLocation = false;
                    this.map.setView([0, 0], this.map.getBoundsZoom([
                        [-90, -180], [90, 180]], true));
                    this.logger.info("MAP: fitting world");
                }
            }
            return this;
        },
        getDefaultZoom: function () {
            return this.cfg.zoom;
        },
        sendMessageError: function (message) {
            if (typeof message == "string") {
                message = {
                    message: message,
                    details: '',
                    severity: 'error'
                }
            } else if (typeof message != "object") {
                this.logger.error("Invalid error message " + message);
                return;
            }
            this.logger.debug("Error message received " + JSON.stringify(message));
            this.fireEvent(this.EVENTS.ERROR, message);
        },
        verifyMap: function () {
            if (this.map == null) {
                this.sendMessageError(getMessage('MapNotReady'));
                return false;
            } else if (this._mapHidden) {
                // console.log('the map is hidden');
                return false;
            }
            return true;
        },
        /**
         * reset the view to the default values
         * 
         * @returns {amtech.console.widget.LeafletMap}
         */
        resetView: function () {
            if (this.verifyMap()) {
                var coords = this.getDefaultCenter();
                this.map.setView([coords[1], coords[0]], this
                    .getDefaultZoom());

            }

            return this;
        },
        /**
         * set the view of the map to the given values
         * 
         * @param x:
         *            longitude
         * @param y:
         *            latitude
         * @param zoom:
         *            zoom
         * @returns {amtech.console.widget.LeafletMap}
         */
        setView: function (x, y, zoom) {
            if (this.verifyMap()) {
                this.map.setView([x, y], zoom);

            }
            return this;
        },
        setViewToWkt: function (wkt) {
            var shape = wktParser.parse(wkt);
            if (shape) {
                if (shape instanceof L.Marker) {
                    var zoom = this.getZoom();
                    this.map.setView(shape.getLatLng(), zoom);
                } else {
                    var bounds = this.getLayerBounds(shape);
                    this.map.fitBounds(bounds, {
                        padding: [0, 0]
                    });
                }
            }

        },
        /**
         * coordinates of the center of the map
         * 
         * @returns {[lng, lat]}
         */
        getCurrentCenterCoords: function () {
            if (this.verifyMap()) {
                var latLng = this.map.getCenter();
                return [latLng.lng, latLng.lat];
            }
            return null;
        },
        /**
         * set current center coordinates
         * 
         * @param x:
         *            longitude
         * @param y:
         *            latitude
         * @returns {amtech.console.widget.LeafletMap}
         */
        setCurrentCenterCoords: function (x, y) {
            if (this.verifyMap()) {
                var zoom = this.getCurrentZoom();
                this.setView(x, y, zoom);
            }
            return this;
        },
        /**
         * set current zoom
         * 
         * @param zoom
         * @returns {amtech.console.widget.LeafletMap}
         */
        setCurrentZoom: function (zoom) {
            if (this.verifyMap()) {
                this.map.setZoom(zoom);
            }
            return this;

        },

        /**
         * get the current zoom
         * 
         * @returns {int}
         */
        getCurrentZoom: function () {
            if (this.verifyMap()) {
                return this.map.getZoom();
            }
            return this.getDefaultZoom();
        },
        isLeafletReady: function () {
            if (!L || !L.Control) {
                this.logger.error("Leaflet not initialized");
                return false;
            }
            return true;
        },
        create: function () {
            var containerElement = this.cfg.containerElement;

            this._mapHidden = false;
            this.map = L.map(containerElement, {
                zoomControl: false,
                maxZoom: 25,
                fadeAnimation: this.cfg.fadeAnimation,
                markerZoomAnimation: this.cfg.markerZoomAnimation,
                zoomAnimation: this.cfg.zoomAnimation
            });
            this.map.on('load', this.updateImageOverlays.bind(this));
            /*
             * this.map.setMaxBounds([ [-88, -180], [88, 180] ]);
             */
            this.setControlsToMap();

            this.map.addLayer(this.layerProximityAreas);
            this.map.addLayer(this.layerFloorplans);
            this.map.addLayer(this.layerAllItems);
            this.map.addLayer(this.layerActiveItems);
            this.map.addLayer(this.layerTimeline);

            if (this.cfg.spiderfy) {
                this.initializeSpiderfier();
            }

            return this;
        },
        initializeSpiderfier: function () {
            var self = this;
            this.oms = new OverlappingMarkerSpiderfier(this.map);
            this.oms.addListener('click', function (marker) {
                self.onClickEntityLayer(undefined, marker);
            });
            this.oms.addListener('spiderfy', function (markers) {
                self.map.closePopup();
            });
        },
        updateImageOverlays: function () {
            if (this.layerFloorplans) {
                this.layerFloorplans.eachLayer(function (imageOverlay) { imageOverlay._reset() });
            }
            if (this.layerOverlays) {
                this.layerOverlays.eachLayer(function (imageOverlay) { imageOverlay._reset() });
            }
            this.fireEvent(this.EVENTS.LOAD);
        },
        onresize: function () {
            if (this.map && this.isShown()) {
                this._checkingResize = this._checkingResize || false;

                if (!this._checkingResize) {
                    this._checkingResize = true;
                    var widget = this;
                    global
                        .setTimeout(
                            function () {

                                var widgetMap = $(widget.cfg.containerElement);
                                var mapContentDiv = widgetMap.parents('.'
                                    + widget.STYLES.MAP_CONTAINER_PANEL);
                                if (mapContentDiv.length == 0) {
                                    mapContentDiv = widgetMap
                                        .parent();
                                }
                                widgetMap.height(mapContentDiv
                                    .height());
                                widgetMap.width(mapContentDiv
                                    .width());

                                widget._checkingResize = false;
                                if (widget._mapSize[0] != mapContentDiv
                                    .width()
                                    || widget._mapSize[1] != mapContentDiv
                                        .height()) {
                                    if (mapContentDiv.width() == 0
                                        || mapContentDiv
                                            .height() == 0) {
                                        widget.hide();
                                    } else {
                                        if (!widget.isShown()) {
                                            this.logger.debug('the map was hidden');
                                            widget.show();
                                        }
                                        widget._mapSize[0] = mapContentDiv
                                            .width();
                                        widget._mapSize[1] = mapContentDiv
                                            .height();

                                        widget.map.invalidateSize();
                                    }
                                }
                            }, this.cfg.resizeDelay);
                }

            }
            return this;
        },
        clearProximityAreas: function () {
            if (this.verifyMap()) {
                var layers = this.layerProximityAreas.getLayers();
                this.layerProximityAreas.clearLayers();
                layers.forEach(this.deleteLayer);

            }
            this._proximityAreas = {};

        },
        clearFloorplans: function () {
            if (this.verifyMap()) {
                var layers = this.layerFloorplans.getLayers();
                this.layerFloorplans.clearLayers();
            }

        },
        addProximityArea: function (area) {
            if (!area) {
                this.logger.debug("cannot add area: argument is missing");
                return this;

            }
            var url = area.url;
            if (!url || url.length < 1) {
                this.logger.debug("Imposible to add an area without url");
                return this;
            }
            if (!("location" in area) || !area.location) {
                this.logger.debug("Impossible to add an are without location");
                return this;
            }

            var data;
            if (url in this._proximityAreas) {
                data = this._proximityAreas[url];
                delete this._proximityAreas[url];
                var layerToRemove = this.findLayer(url,
                    this.layerProximityAreas);
                if (this.isDefined(layerToRemove)) {
                    this.layerProximityAreas.removeLayer(layerToRemove);
                    this.deleteLayer(layerToRemove);
                }
            } else {
                data = {
                    url: url
                };
            }
            data.locationJson = this.fromOldLocation(location);
            data.location = data.locationJson && data.locationJson.wkt;

            if (("description" in area) && (area.description)) {
                data.description = area.description;
            }
            if (("_name" in area) && (area._name)) {
                data._name = area._name;
            }
            var layer = null;
            if (layer = this.createTheLayerWithoutEvents(data,
                this.STYLES.PROXIMITY_AREA, true)) {
                this._proximityAreas[data.url] = data;

                // fullLayer.on("click", this.onClickEntityLayer, this);
                layer.on("mouseover", this.onMouseOverProximityAreaLayer,
                    this);
                layer.on("mouseout", this.onMouseOutProximityAreaLayer,
                    this);
                this.bindPopupAndLabel(layer, data);

                this.layerProximityAreas.addLayer(layer);
            }
        },
        createLayer: function (data) {
            var fullLayer = this.createTheLayerWithoutEvents(data,
                this.STYLES.ALL, false);
            if (fullLayer) {
                if (this.oms) {
                    this.oms.addMarker(fullLayer.theMarker);
                }
                if (!(fullLayer.theLayer instanceof L.Marker)) {
                    fullLayer.on("click", this.onClickEntityLayer, this);

                }
                fullLayer.on("mouseover", this.onMouseOverEntityLayer, this);
                fullLayer.on("mouseout", this.onMouseOutEntityLayer, this);
            }
            return fullLayer;
        },
        moveOverlay: function (overlay, bounds) {
            if (!this.isDefined(overlay) || !this.isDefined(bounds))
                return;

            var leftTop;
            var rightTop;
            var leftBottom;
            if (bounds instanceof L.LatLngBounds) {
                overlay._bounds._southWest.lat = bounds._southWest.lat;
                overlay._bounds._southWest.lng = bounds._southWest.lng;
                overlay._bounds._northEast.lat = bounds._northEast.lat;
                overlay._bounds._northEast.lng = bounds._northEast.lng;

                var e = bounds.getEast();
                var w = bounds.getWest();
                var n = bounds.getNorth();
                var s = bounds.getSouth();

                leftTop = L.latLng(e, n);
                rightTop = L.latLng(w, n);
                leftBottom = L.latLng(e, s);

            } else {
                var points;
                if (typeof bounds == "string") {
                    points = this.getCalibrationControlPoints(bounds);

                } else {
                    points = bounds;
                }
                leftTop = points[0];
                rightTop = points[1];
                leftBottom = points[2];
            }
            overlay.reposition(leftTop, rightTop, leftBottom);

        },
        setImageOverlayUrl: function (layer, imageUrl, onload) {
            var resourceLoadedClbk = this.resourceLoadStart(imageUrl);
            if (resourceLoadedClbk) {
                if (typeof onload == "function") {
                    onload = function () { onload(); resourceLoadedClbk(); };
                } else {
                    onload = resourceLoadedClbk;
                }
            }
            if (typeof onload == "function") {
                layer.once("load", onload);
            }

            if (imageUrl == layer._url) {
                imageUrl = imageUrl + (imageUrl.indexOf("?" < 0) ? "?" : "&") + "nothing=true";

            }
            layer.setUrl(imageUrl);
            // layer._rawImage.src=imageUrl;
        },
        updateFloorplan: function (url, floorplan) {
            var self = this;
            var layer = this.findLayer(url, this.layerFloorplans);
            if (!this.isDefined(layer)) {
                var layer = this.createImageOverlay(floorplan);
                if (this.isDefined(layer)) {
                    layer.url = url;
                    this.layerFloorplans.addLayer(layer);
                }

            } else if (!this.isValidFloorplan(floorplan)) {
                this.removeFloorplanLayer(url);
                return null;
            } else {
                // to change image

                this.setImageOverlayUrl(layer, floorplan.imageurl, function () {
                    self.moveOverlay(layer, floorplan.wkt);
                });
                return layer;
            }
        },
        isValidFloorplan: function (floorplan, acceptEmptyLocation) {

            if (floorplan && floorplan.imageurl && (floorplan.imageurl.length > 0) &&
                floorplan.location) {
                var locationJson = this.fromOldLocation(floorplan.location);
                if (("wkt" in locationJson) && locationJson.wkt.length > 1) {
                    floorplan.wkt = locationJson.wkt;
                } else if (typeof locationJson == "string" && locationJson.length > 1) {
                    floorplan.wkt = locationJson;
                    floorplan.location = { wkt: locationJson };
                }
                if (floorplan.wkt.length == 0) {
                    return !(!acceptEmptyLocation);
                } else {
                    var coords = wktParser.parseCoordinates(floorplan.wkt, this.getIsLatLng());
                    var shape = wktParser.getGeometry(floorplan.wkt);
                    return shape && coords && shape.length > 0 && coords.length > 0;
                }
            }
            return false

        },
        createImageOverlay: function (floorplan) {

            if (!this.isValidFloorplan(floorplan, true)) {
                return null;
            }
            var location = floorplan.wkt;
            var points = this.getCalibrationControlPoints(location);
            var imageUrl = floorplan.imageurl;
            var clbk = this.resourceLoadStart(floorplan.imageurl);
            var overlay = L.imageOverlay.rotated(floorplan.imageurl, points[0], points[1], points[2], {
                opacity: this.cfg.overlayOpacity || .4
            });
            var self = this;
            overlay.on('load', function (e) {
                self.logger.debug("overlay on load");
                e.target._reset();
                clbk();
            });
            // overlay.setOpacity(this.cfg.overlayOpacity);
            return overlay;

        },
        createTheLayerWithoutEvents: function (data, layerClass, noMarker) {
            if (!data) {
                this.logger.info("cannot create layer: argument is missing");
                return this;
            }

            var url = data["@id"];
            if (!url || url.length < 1) {
                this.logger.debug("no url given \n" + JSON.stringify(data, undefined, 2));
                this.sendMessageError(getMessage('NoUrlGiven'));
                return this;
            }
            if (data.locationJson && ("wkt" in data.locationJson)
                && data.locationJson.wkt.length > 1) {
                data.location = data.locationJson.wkt;
            } else {
                data.locationJson = data.locationJson || {};
                data.locationJson.wkt = data.location;
            }
            if (!data.location || data.location.length < 1) {
                this.logger.debug("Cannot create layer because location is missing: \n", JSON.stringify(data, undefined, 2));
                this.sendMessageError(getMessage('NoLocationGiven'));
                return null;
            }

            var location = data.location;
            var name = data._name;
            if (!name || name.length < 1) {
                var pos = url.lastIndexOf('/');
                name = url.substr(pos + 1);
            }
            var description = data.description || '';
            var layer;
            try {
                layer = wktParser.parse(location, this.getIsLatLng());
            } catch (e) {
                this.sendMessageError(getMessage('InvalidGeometry', location));
                return null;
            }
            var fullLayer = L.featureGroup().addLayer(layer);
            fullLayer.url = url;
            layer.fullLayer = fullLayer;
            fullLayer.theLayer = layer;

            if (!layerClass) {
                layerClass = this.STYLES.ALL;
            }

            if (!(layer instanceof L.Marker)) {

                var styleClass = layerClass;
                if (!(layer instanceof L.Polyline)
                    || (layer instanceof L.Polygon)) {
                    styleClass += (" " + this.STYLES.FILL);
                } else {
                    styleClass += (" " + this.STYLES.LINE);

                }
                layer.setStyle({
                    className: styleClass,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: .9
                });

                if (!noMarker) {
                    var marker;
                    var bounds = this.getLayerBounds(layer);
                    var center = bounds.getCenter();

                    marker = L.marker(center);
                    fullLayer.addLayer(marker);
                    marker.fullLayer = fullLayer;
                    fullLayer.theMarker = marker;
                } else {
                    fullLayer.theMarker = undefined;
                }
            } else {
                fullLayer.theMarker = layer;
            }

            fullLayer.data = data;
            if (layer instanceof L.Marker || !noMarker) {
                var iconOptions = {
                    className: layerClass + ' ' + this.STYLES.MARKER_ICON,
                    popupAnchor: [-3, -27]
                };
                var theIcon = this.getIcon(data, iconOptions);
                fullLayer.theMarker.setIcon(theIcon);
            }
            return fullLayer;
        },
        verifyTooltipVisibility: function (lastZoom, newZoom) {

            if (this.__showLabels && Array.isArray(this.cfg.permanentLabels)) {

                var permanent = this.__isInsideZoomRange(newZoom, this.cfg.permanentLabels);
                if (typeof lastZoom == "undefined" || this.__isInsideZoomRange(lastZoom, this.cfg.permanentLabels) != permanent) {
                    this.makeTooltipsPermanent(permanent);
                }
            }
        },
        makeTooltipsPermanent: function (permanent) {
            var forEach = function (l) {

                var marker = l.theMarker;
                if (marker.getTooltip && marker.getTooltip()) {
                    var tooltip = marker.getTooltip();
                    marker.unbindTooltip().bindTooltip(tooltip, {
                        permanent: permanent
                    })
                };

            }
            this.layerAllItems.eachLayer(forEach);
            this.layerActiveItems.eachLayer(forEach);
        },
        toggleLabels(visible) {
            if (typeof visible=="undefined"){
                visible = !this.__showLabels;
            }
            if (visible != this.__showLabels) {
                this.__showLabels=visible;
                if (!visible) {
                    this.makeTooltipsPermanent(false);
                }else{
                    this.makeTooltipsPermanent(this.isPermanentLabels());
                }
            }
            return this;
        },
        __isInsideZoomRange(zoom, range) {
            return !(zoom > this.cfg.permanentLabels[1]) && !(zoom < this.cfg.permanentLabels[0]);
        },
        isPermanentLabels() {
            if (!this.cfg.permanentLabels || !this.__showLabels) {
                return false;
            } else {
                if (Array.isArray(this.cfg.permanentLabels)) {
                    return this.__isInsideZoomRange(this.map.getZoom(), this.cfg.permanentLabels);
                } else {
                    return true;
                }
            }
        },
        bindPopupAndLabel: function (fullLayer, data) {
            var label = data.shortName;
            var labelDefinition = this.cfg.labelDefinition;
            if (typeof labelDefinition == "function") {
                label = labelDefinition(data);
            }
            var layer;
            if (fullLayer.theMarker) {
                layer = fullLayer.theMarker;
            } else {
                layer = fullLayer.theLayer;
            }
            var permanent = this.isPermanentLabels();
            layer.bindTooltip(label, {
                className: this.STYLES.LABEL,
                permanent: permanent
            }).openTooltip();
            /*
                        fullLayer
                            .bindPopup("<h3>" + data._name + "</h3>"
                                + ((data.description && data.description.length > 0) ? ("<span class='"
                                    + this.STYLES.POPUP_TEXT + "'>"
                                    + data.description + "</span>") : ''), {
                                    className: this.STYLES.POPUP
                                });
            */
        },
        clearMap: function () {
            if (this.map) {
                this.unselectLayer(undefined, true);
            }
            if (this.oms) {
                this.oms.clearMarkers();
            }
            var layers;
            layers = this.layerAllItems.getLayers();
            this.layerAllItems.clearLayers();
            layers.forEach(this.deleteLayer.bind(this));

            layers = this.layerActiveItems.getLayers();
            this.layerActiveItems.clearLayers();
            layers.forEach(this.deleteLayer.bind(this));

            layers = this.layerTimeline.getLayers();
            this.layerTimeline.clearLayers();
            // layers.forEach(this.deleteLayer);

            if (this.isDefined(this.layerOverlays)) {
                this.layerOverlays.clearLayers();
            }

            this.clearProximityAreas();
            this.clearFloorplans();

            if (this.unlocatedData) {
                this.unlocatedData = {};
            }
            this._elements = {};
            this.clearEventListeners(this.EVENTS.CHANGE);

        },
        removeFloorplanLayer: function (url) {
            var layer = this.findLayer(url, this.layerFloorplans);
            if (this.isDefined(layer)) {
                this.layerFloorplans.removeLayer(layer);
            }
            return layer;
        },
        removeLayer: function (url) {

            var layer = this.findLayer(url, this.layerAllItems);
            if (this.isDefined(layer)) {
                this.layerAllItems.removeLayer(layer);

            } else {
                // we search on active item layer
                layer = this.findLayer(url, this.layerActiveItems);
                if (this.isDefined(layer)) {
                    this.layerActiveItems.removeLayer(layer);

                }

            }

            var historic = this.findLayer(url, this.layerTimeline);
            this.layerTimeline.removeLayer(historic);
            this.removeFloorplanLayer(url);

            return this.deleteLayer(layer);
        },
        deleteLayer: function (layer) {
            if (layer != null) {
                layer.getLayers().forEach(function (item) {
                    item.clearAllEventListeners()
                });
                layer.clearLayers();
                delete layer.theLayer;
                if (layer.theMarker) {
                    if (this.oms) {
                        this.oms.removeMarker(layer.theMarker);
                    }
                    delete layer.theMarker;

                }
            }
            return this;
        },
        onClickEntityLayer: function (event, layer) {
            if (this.isShown() && this.canSelect()) {
                // console.log("event caught: "+event.type);
                var layer = (layer || (event && event.layer));
                var fullLayer;
                if (layer && layer.fullLayer) {
                    fullLayer = layer.fullLayer;
                } else {
                    fullLayer = layer;
                }
                var url = fullLayer.url;

                if (!event) {
                    this.fireEvent(this.EVENTS.CLICK, {
                        url: url,
                        layer: fullLayer
                    });
                }

            }
        },
        onMouseOverProximityAreaLayer: function (event) {
            if (this.isShown()) {
                event.producer = this;
                // console.log("event caught: "+event.type);
                var fullLayer = event.layer.fullLayer;
                this.replaceClassToLayer(fullLayer, "", this.STYLES.HOVER);
            }
        },
        onMouseOutProximityAreaLayer: function (event) {
            if (this.isShown()) {
                event.producer = this;
                // console.log("event caught: "+event.type);
                var fullLayer = event.layer.fullLayer;
                this.replaceClassToLayer(fullLayer, this.STYLES.HOVER, "");
            }
        },
        onMouseOverEntityLayer: function (event) {
            if (this.isShown()) {
                event.producer = this;
                // console.log("event caught: "+event.type);
                var fullLayer = event.layer.fullLayer;
                this.replaceClassToLayer(fullLayer, "", this.STYLES.HOVER);
            }
        },
        onMouseOutEntityLayer: function (event) {
            if (this.isShown()) {
                event.producer = this;
                // console.log("event caught: "+event.type);
                var fullLayer = event.layer.fullLayer;
                this.replaceClassToLayer(fullLayer, this.STYLES.HOVER, "");
            }
        },
        addElement: function (data) {
            if (!data) {
                this.logger.debug("missing argument");
                return null;

            } else if (!data["@id"] || data["@id"].length <= 0) {
                this.sendMessageError(getMessage("NoUrlGiven"));
                return null;
            }
            var layer = this.addLayer(data);
            if (!layer || layer == null) {
                this.addUnlocatedData(data);
            } else {
                var overlay = this.createImageOverlay(data.floorplan);
                if (this.isDefined(overlay)) {
                    overlay.url = data["@id"];
                    this.layerFloorplans.addLayer(overlay);
                }
            }
            this._elements[data["@id"]] = data;
            return this;

        },
        /**
         * Add the layer associated to an element. Returns null if the layer is not
         * created
         * 
         * @param data:
         *            element information
         * @returns {L.Layer}
         */
        addLayer: function (data) {
            if (!data) {
                this.logger.debug("missing argument");
                return null;

            } else if (!data["@id"] || data["@id"].length <= 0) {
                this.sendMessageError(getMessage("NoUrlGiven"));
                return null;

            } else if (!this.map) {
                return null;
            } else {
                if (!data.locationJson || !("wkt" in data.locationJson)
                    || data.locationJson.wkt.length < 1) {
                    data.locationJson = this.fromOldLocation(data.location || {});

                }
                data.location = data.locationJson.wkt;
                if (typeof data.location !== "string"
                    || data.location.length < 1) {
                    return null;
                }

                var layer = this.createLayer(data);
                if (layer != null) {
                    this.bindPopupAndLabel(layer, data);
                    this.layerAllItems.addLayer(layer);
                    return layer;
                } else {
                    return null;

                }
            }
        },
        fireViewChangeEvent: function (eventData) {
            if (this.isShown()) {
                var event = {
                    type: eventData.type || 'moveend',
                    src: this,
                    wkt: this.getCurrentBoundsWkt(),
                    view: this.map.getBounds()
                };
                this.fireEvent(this.EVENTS.VIEW_CHANGE, event);
            }
        },
        registerViewChangeCallbacks: function () {

            if (!this.map) {
                this.sendMessageError(getMessage("MapNotReady"));
                return this;
            }
            var self = this;
            if (Array.isArray(this.cfg.permanentLabels)) {
                var lastZoom;
                var onZoomend = function () {
                    var zoom = self.map.getZoom();
                    self.verifyTooltipVisibility(lastZoom, self.map.getZoom());
                    lastZoom = zoom;
                }
                this.map.on("zoomend", onZoomend);
            }

            this.map.on("moveend", this.fireViewChangeEvent, this);
            this.map.on("zoomend", this.fireViewChangeEvent, this);

        },
        createBaseLayers: function () {
            this.unlocatedData = {};

            // creating layer for the list of element
            this.layerProximityAreas = L.featureGroup().setZIndex(120);
            this.layerAllItems = L.featureGroup().setZIndex(125);
            this.layerFloorplans = L.featureGroup().setZIndex(130);

            // creating layer for selected element
            this.layerTimeline = L.featureGroup().setZIndex(100);

            this.layerActiveItems = L.featureGroup().setZIndex(150);

        },
        setControlsToMap: function () {
            if (this.map) {
                var self = this;
                //adding amtech
                var control = self.getControl(self.CONTROLS.AMTECH);
                if (control && control != null) {
                    control.addTo(self.map);
                }

                var controls = [
                    this.CONTROLS.ZOOM,
                    this.CONTROLS.LOCATEME,
                    this.CONTROLS.RESIZER,
                    this.CONTROLS.LAYER,
                    this.CONTROLS.LINK_SEARCH,
                    this.CONTROLS.COORDINATE
                ];
                controls.forEach(function (controlId) {
                    if (self.isControlOn(controlId)) {
                        var control = self.getControl(controlId);
                        if (control && control != null) {
                            control.addTo(self.map);
                        }
                    }

                });
            }
        },
        getLocateMySelfControl: function () {
            return this.getControl(this.CONTROLS.LOCATEME);
        },
        getResizeControl: function () {
            return this.getControl(this.CONTROLS.RESIZER);
        },
        getZoomControl: function () {
            return this.getControl(this.CONTROLS.ZOOM);
        },
        getCoordinateControl: function () {
            return this.getControl(this.CONTROLS.COORDINATE);
        },
        getLayerControl: function () {
            return this.getControl(this.CONTROLS.LAYER);
        },
        getLinkSearchControl: function () {
            return this.getControl(this.CONTROLS.LINK_SEARCH);
        },
        getControl: function (control) {
            var controlVar = this._getControlId(control);

            if (!this.isDefined(this[controlVar])) {
                if (this.isLeafletReady()) {
                    this[controlVar] = this.createControl(control);
                } else {
                    return null;
                }
            }
            return this[controlVar];
        },
        isControlOn: function (control) {
            var controlVar = this._getControlId(control);
            return this[controlVar + "_isShown"] || false;
        },
        _getControlId: function (control) {
            return "_" + control + "Control";
        },
        toggleControl: function (control, option) {
            if (this.map) {
                var wasOn = this.isControlOn(control);
                if (arguments.length < 2
                    || option != wasOn) {
                    var controlVar = this._getControlId(control);
                    this[controlVar + "_isShown"] = !wasOn;
                    var obj = this.getControl(control);
                    if (!obj) {
                        return;
                    } else if (this[controlVar + "_isShown"]) {
                        obj.addTo(this.map);
                    } else {
                        obj.remove(this.map);
                    }
                }
            }

        },
        withLayerControl: function () {
            return this.isControlOn(this.CONTROLS.LAYER);
        },
        withZoomControl: function () {
            return this.isControlOn(this.CONTROLS.ZOOM);
        },
        withResizeControl: function () {
            return this.isControlOn(this.CONTROLS.RESIZER);
        },

        withCoordinateControl: function () {
            return this.isControlOn(this.CONTROLS.COORDINATE);
        },
        withLocateMeControl: function () {
            return this.isControlOn(this.CONTROLS.LOCATEME);
        },
        withLinkSearchControl: function () {
            return this.isControlOn(this.CONTROLS.LINK_SEARCH);
        },
        toggleLocateMeControl: function (option) {
            return this.toggleControl(this.CONTROLS.LOCATEME, option);
        },
        toggleCoordinateControl: function (option) {
            return this.toggleControl(this.CONTROLS.COORDINATE, option);
        },
        toggleLayerControl: function (option) {
            return this.toggleControl(this.CONTROLS.LAYER, option);
        },
        toggleResizeControl: function (option) {
            return this.toggleControl(this.CONTROLS.RESIZER, option);
        },
        toggleLinkSearchControl: function (option) {
            return this.toggleControl(this.CONTROLS.LINK_SEARCH, option);
        },
        fireOnResize: function (eventData) {
            this.onresize();
            this.fireEvent(this.EVENTS.CONTAINER_RESIZE, eventData);
        },
        isEditCoordinateControl: function () {
            return this.cfg.editCoordinateControl || false;
        },
        findUnlocatedData: function (url) {
            return this.unlocatedData[url];
        },
        removeUnlocatedData: function (url) {
            if (url in this.unlocatedData) {
                delete this.unlocatedData[url];
            }
            return this;
        },
        addUnlocatedData: function (data) {
            this.unlocatedData[data["@id"]] = data;

            return this;
        },
        removeElement: function (url) {
            var data;
            if (!url) {
                this.logger.info("missing argument 'url' when removing element");

            } else if (!this._elements[url]) {
                this.logger.info("element '" + url + "' does not exists");

            } else {
                if (this.findUnlocatedData(url)) {
                    this.removeUnlocatedData(url);

                } else {
                    this.removeLayer(url);

                }
                delete this._elements[url];
            }

            return this;
        },
        getElement: function (url) {
            return this._elements[url];
        },
        copyOptions: function (options) {
            var result = {};
            for (var key in options) {
                if (options.hasOwnProperty(key)) {
                    result[key] = options[key];
                }
            }
            return result;
        },
        getOverlaysLayer: function () {
            if (!this.verifyMap()) {
                return null;
            }
            if (!this.isDefined(this.layerOverlays)) {
                this.layerOverlays = L.featureGroup().setZIndex(120);
            }
            if (!this._shownLayerOverlays) {
                this.layerOverlays.clearLayers();
                this.map.addLayer(this.layerOverlays);
                this._shownLayerOverlays = true;
            }
            return this.layerOverlays;
        },
        releaseOverlaysLayer: function () {
            if (!this.isDefined(this.layerOverlays) || !this._shownLayerOverlays) {
                return;
            }
            this.layerOverlays.clearLayers();
            this.map.removeLayer(this.layerOverlays);
            this._shownLayerOverlays = false;

        },
        getCalibrationControlPoints: function (wkt) {
            var leftTop, rightTop, leftBottom;
            var bounds = this.map.getBounds();
            var e = bounds.getEast();
            var n = bounds.getNorth();
            var w = bounds.getWest();
            var s = bounds.getSouth();

            var newEast;
            var newWest;
            var newNorth;
            var newSouth;

            if (!wkt || wkt.length == 0) {

                newEast = (3 * e + w) / 4;
                newWest = (3 * w + e) / 4;
                newNorth = (3 * n + s) / 4;
                newSouth = (3 * s + n) / 4;

                leftTop = [newNorth, newWest];
                rightTop = [newNorth, newEast];
                leftBottom = [newSouth, newWest];
            } else {
                var shape = wktParser.getGeometry(wkt);
                var coords = wktParser.parseCoordinates(wkt, this.getIsLatLng())
                var r = 0;
                switch (shape) {
                    case GEOMETRY.CIRCLE:
                        coords = coords[0];
                    case GEOMETRY.POINT:
                        var newEast = (e + coords[1]) / 4;
                        var newWest = (w + coords[1]) / 4;
                        var newNorth = (n + coords[0]) / 4;
                        var newSouth = (s + coords[0]) / 4;

                        leftTop = [newNorth, newWest];
                        rightTop = [newNorth, newEast];
                        leftBottom = [newSouth, newWest];
                        break
                    case GEOMETRY.RECTANGLE:

                        leftTop = [coords[1][0], coords[0][1]];
                        rightTop = [coords[1][0], coords[1][1]];
                        leftBottom = [coords[0][0], coords[0][1]];
                        break
                    case GEOMETRY.POLYGON:
                    case GEOMETRY.POLYLINE:
                        leftTop = coords[0][0];
                        rightTop = coords[0][1];
                        leftBottom = coords[0][2];
                        break;
                    default:
                        this.logger.error("unhandled geometry");
                        return undefined
                }
            }
            return [L.latLng(leftTop), L.latLng(rightTop), L.latLng(leftBottom)];
        },
        getWKTfromLayer: function (layer) {
            return wktParser.stringify(layer, this.cfg.isLatLng);
        },
        fromOldLocation: function (locationField) {
            if (!locationField) {
                locationField = {
                    wkt: ''
                };

            } else if (typeof locationField == "string") {
                if (!locationField.trim().startsWith('{')) {
                    var pos = locationField.lastIndexOf(";");
                    locationField = "{"
                        + (locationField.substr(0, pos + 1)
                            + '"wkt":"'
                            + locationField.substr(pos + 1) + '"')
                            .replace(
                                /\b([a-zA-Z][a-zA-Z0-9_]*)\b=([^;]*);/g,
                                '"$1":"$2",') + '}';
                }
                locationField = JSON.parse(locationField);
            }
            return locationField;
        },
        hasElement: function (url) {
            return this.isDefined(this.getElement(url));

        },
        updateElement: function (newData) {
            if (!newData || !newData["@id"]) {
                this.sendMessageError(getMessage("NoUrlGiven"));
                return this;
            }
            var url = newData["@id"];
            var data = this.getElement(url);
            if (!data) {
                // does not exist so we add it
                return this.addElement(newData);
            }
            if (this.oms) {
                this.oms.unspiderfy();
            }
            for (var key in data) {
                if (data.hasOwnProperty(key) && !newData[key]) {
                    newData[key] = data[key];
                }
            }
            var isUnlocated = this.isDefined(this.findUnlocatedData(url));

            var isSelected = this.getSelectedElement() == newData["@id"];
            var container = (isSelected) ? this.layerActiveItems
                : this.layerAllItems;
            var layer;

            if (!("locationJson" in newData || !newData.locationJson.wkt)) {
                data.locationJson = this.fromOldLocation(data.location);

            }
            data.location = data.locationJson.wkt;

            if (isUnlocated || data.location != newData.location) {
                if (!isUnlocated) {
                    this.removeLayer(url);
                }
                layer = this.addLayer(newData);
                if (layer != null) {
                    this.bindPopupAndLabel(layer, newData);
                    container.addLayer(layer);
                    this.replaceClassToLayer(this.STYLES.ALL,
                        this.STYLES.SELECTED);

                } else {
                    this.addUnlocatedData(newData);

                }

            } else {

                layer = (isSelected) ? container.getLayers()[0] : this
                    .findLayer(url);
                if (data._name != newData._name
                    || data.description != newData.description
                    || data.icon != newData.icon) {
                    this.bindPopupAndLabel(layer, newData);
                    if (data.icon != newData.icon) {
                        // TODO: change icon
                    }
                }

            }
            if (this.isDefined(layer)) {
                this.updateFloorplan(url, newData.floorplan);
            }

            if ((url in this._proximityAreas)
                && (this._proximityAreas[url])) {
                this.addProximityArea(newData);
            }
            this._elements[url] = newData;
            return this;
        },
        findLayer: function (url, layerGroup) {

            var container = layerGroup || this.layerAllItems;
            var result = null;
            container.eachLayer(function (layer) {
                if (layer.url == url) {
                    result = layer;
                }

            });
            return result;
        },
        replaceClassToLayer: function (layer, oldClassName, newClassName) {
            if (this.verifyMap()) {
                if (layer instanceof L.Marker) {
                    $(layer._icon).removeClass(oldClassName).addClass(
                        newClassName);
                } else if (layer instanceof L.Path) {
                    layer.getElement().removeClass(
                        oldClassName).addClass(newClassName);
                } else if (layer instanceof L.LayerGroup) {
                    var widget = this;
                    var fcn = this.replaceClassToLayer;
                    layer.eachLayer(function (lay) {
                        fcn.call(widget, lay, oldClassName, newClassName);
                    });
                }
            }
        },
        unselectLayer: function (event, doNotSendEvent) {
            if (this.verifyMap() && this.canSelect()) {
                var url = this.getSelectedElement();
                if (this.isDefined(url)) {
                    this._selectedElement = undefined;
                    var oldItem = this.layerActiveItems.getLayers()[0];

                    if (this.isDefined(oldItem)) {
                        // layer
                        this.layerActiveItems.removeLayer(oldItem);
                        this.layerAllItems.addLayer(oldItem);

                        this.replaceClassToLayer(oldItem,
                            this.STYLES.SELECTED, this.STYLES.ALL);

                    } else {
                        // unlocated data

                    }
                    if (!doNotSendEvent) {
                        this.fireEvent(this.EVENTS.SELECTION_CHANGE, {
                            url: url,
                            selected: false,
                            layer: oldItem,
                            leafletEvent: event
                        });
                    }
                }
            }
            return this;
        },
        selectLayer: function (url, event, doNotSendEvent) {
            if (this.verifyMap()) {
                if (this.canSelect()) {

                    var currentElement = this.getSelectedElement();
                    if (url != currentElement) {

                        var selectedLayer = this.findLayer(url);
                        var data;
                        if (this.isDefined(selectedLayer)) {
                            this.unselectLayer(event, doNotSendEvent);

                            this.layerAllItems.removeLayer(selectedLayer);
                            this.layerActiveItems.addLayer(selectedLayer);
                            this.replaceClassToLayer(selectedLayer,
                                this.STYLES.ALL, this.STYLES.SELECTED);

                        } else {
                            if ((data = this.findUnlocatedData(url)) != null) {
                                selectedLayer = undefined;
                            }
                        }

                        this._selectedElement = url;
                        if (selectedLayer) {
                            // this.centerToLayer(selectedLayer);
                        }
                        if (!doNotSendEvent) {
                            this.fireEvent(this.EVENTS.SELECTION_CHANGE, {
                                url: url,
                                selected: true,
                                layer: selectedLayer,
                                leafletEvent: event
                            });
                        }
                    }
                }
            }
            return this;
        },
        getSelectedElement: function () {
            return this._selectedElement;
        },
        canSelect: function () {
            return this.cfg.canSelect;
        },
        setCanSelect: function (canSelect) {
            this.cfg.canSelect = canSelect;
        },
        getCurrentBoundsWkt: function () {
            if (this.verifyMap()) {
                var bounds = this.map.getBounds();
                return wktParser.stringify(bounds, this.cfg.isLatLng);
            }
            return null;
        },
        /*
         * CONTROLS : { LOCATEME : "locateMySelf", ZOOM : "zoom", RESIZER :
         * "containerResizer", LAYER : "layer", COORDINATE : "coordinate", }
         */
        createControl: function (id, options) {
            switch (id) {
                case this.CONTROLS.AMTECH: return this.createAmtechImageControl(options);
                case this.CONTROLS.LOCATEME: return this.createLocateMySelfControl(options);
                case this.CONTROLS.ZOOM: return this.createLocalizedZoomControl(options);
                case this.CONTROLS.RESIZER: return this.createResizeControl(options);
                case this.CONTROLS.LAYER: return this.createLocalizedLayerControl(options);
                case this.CONTROLS.COORDINATE: return this.createCoordinateControl(options);
                case this.CONTROLS.LINK_SEARCH: return this.createLinkSearchControl(options);
            }
            return null;
        },
        createAmtechImageControl: function () {
            if (!L.Control.HyperlinkImage) {
                if (amtech.console.defineLeafletImageControl) {
                    amtech.console.defineLeafletImageControl(L);
                } else {
                    return null;
                }
            }
            return new L.Control.HyperlinkImage();
        },
        createLocateMySelfControl: function () {
            if (!L.Control.LocateMySelf) {
                if (amtech.console.defineLocateMySelfControl) {
                    amtech.console.defineLocateMySelfControl(L);
                } else {
                    return null;
                }
            }
            return new L.Control.LocateMySelf();
        },
        createResizeControl: function () {
            if (!L.Control.ContainerResizer) {
                if (amtech.console.defineContainerResizerControl) {
                    amtech.console.defineContainerResizerControl(L);
                } else {
                    return null;
                }
            }

            return new L.Control.ContainerResizer({
                onresize: {
                    fcn: this.fireOnResize,
                    context: this
                }
            });
        },
        createLocalizedLayerControl: function () {
            var options = {
                position: "bottomright",
                collapsed: true,
                autoZIndex: true
            };

            var baseLayers = {};// put here the tile layers or background
            var keyValues = [
                [getMessage("Things"), this.layerAllItems],
                [getMessage("Timeline"), this.layerTimeline],
                [getMessage("ProximityAreas"), this.layerProximityAreas],
                [getMessage("Floorplans"), this.layerFloorplans]];
            // overlays
            var overlays = {};
            keyValues.forEach(function (keyValue) {
                overlays[keyValue[0]] = keyValue[1];
            })
            return new L.Control.Layers(baseLayers, overlays, options);
        },
        createLocalizedZoomControl: function () {
            if (!L.Control.Zoom) {
                return null;
            }
            var zoomOptions = {};
            var options = {
                zoomInTitle: getMessage('ZoomIn'),
                zoomOutTitle: getMessage('ZoomOut')
            };
            for (var key in options) {
                if (options.hasOwnProperty(key) && options[key]) {
                    zoomOptions[key] = options[key];
                }
            }
            return new L.Control.Zoom(zoomOptions);
        },
        createCoordinateControl: function () {
            if (!L.Control.Coordinates) {
                return null;
            }
            return L.Control
                .coordinates({
                    position: "bottomleft",
                    decimals: 8,
                    decimalSeparator: ".",
                    centerUserCoordinates: true,
                    enableUserInput: this.cfg.allowUserInteractionOnCoordinates, // optional
                    // default
                    // true
                    labelTemplateLat: "Lat: {y}",
                    labelTemplateLng: "Lng: {x}"
                });

        },
        setLocationEditListener: function (onchange) {
            this.clearLocationEditListener();
            if (typeof onchange == "function") {
                this._onLocationEditListener = onchange;
            } else {
                this._onLocationEditListener = undefined;
            }
        },
        registerLocationEditListener: function () {
            if (typeof this._onLocationEditListener == "function") {
                this.addEventListener(this.EVENTS.CHANGE, this._onLocationEditListener);
            }
        },
        clearLocationEditListener: function (onchange) {
            if (typeof this._onLocationEditListener == "function") {
                this.removeEventListener(this.EVENTS.CHANGE, this._onLocationEditListener);
            }
            this._onLocationEditListener = undefined;
        }
    });

    amtech.console.widget.SpatialHistoryHandler = amtech.console.widget.BaseWidget
        .extend({
            init: function (cfg) {
                this._super(cfg);
                this._timeline = {};
                this.layer = this.cfg.map.layerTimeline;
            },
            verifyCfg: function (cfg) {
                cfg = this._super(cfg);
                if (!cfg.map
                    || !(cfg.map instanceof amtech.console.widget.LeafletMap)) {
                    this.sendMessageError(getMessage("MapMissing"));
                }
                return cfg;
            },
            verifyMap: function () {
                return this.cfg.map.verifyMap();
            },
            removeLayerFromHistory: function (data) {
                if (data && data != null && data.layer) {
                    data.entryList.forEach(function (entry) {
                        if (entry.layer) {
                            delete entry.layer;
                        }
                    });
                    if (this.layer) {
                        this.layer.removeLayer(data.layer);
                        this.layer.removeLayer(data.path);
                    }
                    delete data.layer;
                    delete data.path;
                }

            },
            clearHistory: function (url) {
                if (!url) {

                    for (var key in this._timeline) {
                        if (this._timeline.hasOwnProperty(key)) {
                            this.removeLayerFromHistory(this
                                .getHistoryElement(key));
                            delete this._timeline[key];
                        }
                    }

                } else {
                    this.removeLayerFromHistory(this.getHistoryElement(url));
                    delete this._timeline[url];
                }
            },
            getLayerBounds: function (layer) {
                if (layer._map || (!(layer instanceof L.Marker) && !(layer instanceof L.Circle))) {
                    return layer.getBounds();
                } else if (layer instanceof L.Marker) {
                    return L.latLngBounds([layer.getLatLng(), layer.getLatLng()]);
                } else if (layer instanceof L.Circle) {
                    return L.latLngBounds([layer.getLatLng(), layer.getLatLng()]);
                } else {
                    return layer.getBounds();
                }
            },
            getIsLatLng: function () {
                return this.cfg.map.isLatLng();
            },
            getHistoryElement: function (group) {
                return this._timeline[group];
            },
            insertEntryToList: function (entryList, entry) {
                var min = 0, max = entryList.length - 1, i;
                if (entryList.length == 0
                    || entryList[entryList.length - 1].time < entry.time) {
                    entryList.push(entry);
                    min = entryList.length;
                } else {
                    var e;
                    while (min < max) {
                        i = Math.floor((min + max) / 2);
                        e = entryList[i];
                        if (e.time == entry.time) {
                            min = max = i;
                        } else if (e.time < entry.time) {
                            min = i + 1;
                        } else {
                            max = i;
                        }
                    }

                    entryList.splice(min, 0, entry);
                }
                return min;
            },

            createEmptyHistoryElement: function (url) {
                this._timeline[url] = {
                    id: url,
                    entryList: [],
                    layer: L.featureGroup().addTo(this.layer),
                    path: L.polyline([]).addTo(this.layer)

                };
                this._timeline[url].path.setStyle({
                    className: this.cfg.map.STYLES.TIMELINE_PATH,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: .9
                });
                return this._timeline[url];
            },
            addHistoryElementEntry: function (entry) {
                var timeStamp = entry.time,
                    wkt = entry.wkt,
                    url = entry.url;

                entry.layer = wktParser.parse(wkt, this.getIsLatLng());
                entry.layer.bindPopup((!url ? '' : 'url=' + url + '<br/>')
                    + "timestamp=" + timeStamp);
                var styleClass = this.cfg.map.STYLES.TIMELINE;
                if (entry.layer instanceof L.Marker) {
                    // we need to set the icon

                    var icon = this.cfg.map.getIcon({}, {
                        className: styleClass + ' '
                            + this.cfg.map.STYLES.MARKER_ICON,
                        popupAnchor: [-3, -27]
                        // point from which the popup should open relative to the
                        // iconAnchor
                    });
                    entry.layer.setIcon(icon);
                } else {
                    if (!(entry.layer instanceof L.Polyline)
                        || (entry.layer instanceof L.Polygon)) {
                        styleClass += (" " + this.cfg.map.STYLES.FILL);
                    } else {
                        styleClass += (" " + this.cfg.map.STYLES.LINE);

                    }
                    entry.layer.setStyle({
                        className: styleClass,
                        weight: 1,
                        opacity: 1,
                        fillOpacity: .9
                    });
                }

                var element = this.getHistoryElement(url);
                if (!element) {
                    element = this.createEmptyHistoryElement(url);
                }
                var pos = this.insertEntryToList(element.entryList, entry);
                var point = (entry.layer instanceof L.Marker) ? entry.layer
                    .getLatLng() : getLayerBounds(entry.layer).getCenter();
                var latlngs = element.path.getLatLngs();
                latlngs.splice(pos, 0, point);
                element.path.setLatLngs(latlngs);
                element.layer.addLayer(entry.layer);

            },
            addHistoryElements: function (url, snapshots) {
                var TIMESTAMP = "_lastModified",
                    VALUE = "location",
                    value, timestamp;

                var elementId, obj, entry;
                for (var i = 0; i < snapshots.length; i++) {
                    obj = snapshots[i];
                    if (!obj.hasOwnProperty(TIMESTAMP)) {
                        this.logger.info("there is a snapshot without time");
                        continue;
                    }
                    timestamp = obj[TIMESTAMP];

                    if (!obj.hasOwnProperty(VALUE)) {
                        this.logger.info("there is a snapshot without value");
                        continue;
                    }
                    var valueJson = this.cfg.map.fromOldLocation(obj[VALUE]);
                    value = valueJson.wkt;
                    entry = {
                        url: url,
                        wkt: value,
                        time: timestamp
                    };
                    this.addHistoryElementEntry(entry);

                }
            },

            destroy: function () {
                this.clearHistory();
                this._super();
            }

        });

    amtech.console.defineLeafletImageControl = function (L) {
        L.Control.HyperlinkImage = L.Control
            .extend({
                options: {
                    position: 'topright',
                    title: "AMTech solutions",
                    src: "http://wiki.amtech.mx/mediawiki/resources/assets/amtech-mini.png",
                    href: "http://www.amtech.solutions"
                },
                onAdd: function (map) {
                    var controlDiv = L.DomUtil.create('div', 'leaflet-bar');
                    L.DomEvent.addListener(controlDiv, 'click', L.DomEvent.stopPropagation);

                    var controlUI = L.DomUtil.create('a', 'map-amtech', controlDiv);
                    controlUI.title = this.options.title;
                    controlUI.href = this.options.href;
                    controlUI.target = "_blank";
                    var icon = L.DomUtil.create("img", "", controlUI);
                    icon.src = this.options.src;
                    return controlDiv;
                }
            });
    }
})(window)