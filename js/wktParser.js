/*
 *  Copyright (c) 2014-2014 amTech
 *  *
 *  * This file is subject to the terms and conditions defined in file 'LICENSE',
 *  * which is part of this source code package.
 */
(function (window) {
    function initParser(window) {
        var GEOMETRY = window.GEOMETRY = {
            POINT: "POINT",
            POLYGON: "POLYGON",
            POLYLINE: "LINESTRING",
            CIRCLE: "CIRCLE",
            RECTANGLE: "RECTANGLE"
        };
        window.wktParser = {
            prepareCoordinates: function (s, isLatLng) {
                if (isLatLng) {
                    return s.replace(/\(/g, '[').replace(/\)/g, ']').replace(
                        /(\-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\s+(\-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g, '[$1, $2]');

                } else {
                    return s.replace(/\(/g, '[').replace(/\)/g, ']').replace(
                        /(\-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\s+(\-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g, '[$2, $1]');

                }
            },
            getGeometry: function (string) {
                var pos = string.indexOf('(');
                return string.substr(0, pos).toUpperCase().trim();

            },
            parseCoordinates: function (string, isLatLng) {
                var pos = string.indexOf('(');

                var geometry = string.substr(0, pos).toUpperCase().trim();
                var coords;
                try {
                    coords = JSON.parse(this.prepareCoordinates(string.substr(pos),
                        isLatLng));

                } catch (e) {
                    logger.error("invalid wkt '" + coords + "'");

                    return undefined;
                }

                switch (geometry) {
                    case GEOMETRY.POINT:
                        return coords[0];
                    case GEOMETRY.CIRCLE:
                        coords[1] = coords[1] * 1000;
                        return coords;
                    case GEOMETRY.POLYGON:
                    case GEOMETRY.POLYLINE:
                        return coords;
                    case GEOMETRY.RECTANGLE:
                        if (coords.length > 2) {
                            // format: minx, maxX, minY, maxY
                            coords = [[coords[0], coords[2]], [coords[1], coords[3]]];
                        }
                        return coords;
                    default:
                        logger.log("Unknown geometry " + geometry);
                }
                return undefined;
            },
            parse: function (string, isLatLng) {

                var pos = string.indexOf('(');

                var geometry = string.substr(0, pos).toUpperCase().trim();
                var coords;
                try {
                    coords = JSON.parse(this.prepareCoordinates(string.substr(pos),
                        isLatLng));

                } catch (e) {
                    logger.error("invalid wkt '" + coords + "'");

                }

                switch (geometry) {
                    case GEOMETRY.POINT:
                        return L.marker(coords[0]);
                    case GEOMETRY.POLYGON:
                        return L.polygon(coords);
                    case GEOMETRY.POLYLINE:
                        return L.polyline(coords);
                    case GEOMETRY.CIRCLE:
                        return L.circle(coords[0], coords[1] * 1000);
                    case GEOMETRY.RECTANGLE:
                        if (coords.length > 2) {
                            // format: minx, maxX, minY, maxY
                            coords = [[coords[0], coords[2]], [coords[1], coords[3]]];
                        }
                        return L.rectangle(coords);
                    default:
                        logger.log("Unknown geometry " + geometry);
                }
                return null;
            },
            stringifyCoords: function (latlng, isLatLng, page) {
                var lat = latlng.lat;
                var lng = latlng.lng;
                if (page && page != 0) {
                    lng += page * 360;
                }
                return (isLatLng) ? lat + " " + lng : lng + " " + lat;
            },
            stringify: function (layer, isLatLng) {
                var self = this;
                var wkt = null;
                var latlng;

                var getPagesToCenter = function (lng) {
                    return -Math.floor((lng + 180) / 360)
                };

                if (layer != null) {
                    var page = 0;
                    if (layer instanceof L.Marker || layer instanceof L.LatLng
                        || layer instanceof L.Circle) {
                        if (layer instanceof L.LatLng) {
                            latlng = layer;
                        } else {
                            latlng = layer.getLatLng();
                        }

                        page = getPagesToCenter(latlng.lng);
                    } else {
                        bounds = undefined;
                        if (layer instanceof L.LatLngBounds) {
                            bounds = layer;
                        } else if (typeof layer.getBounds == "function") {
                            bounds = layer.getBounds();
                        }

                        page = getPagesToCenter((bounds.getEast() + bounds.getWest()) / 2);
                    }

                    if (layer instanceof L.Marker || layer instanceof L.LatLng) {
                        latlng = layer;
                        if (!(layer instanceof L.LatLng)) {
                            latlng = layer.getLatLng();
                        }
                        wkt = GEOMETRY.POINT + "(" + this.stringifyCoords(latlng, isLatLng, page)
                            + ")";
                    } else if (layer instanceof L.Circle) {

                        wkt = GEOMETRY.CIRCLE + "("
                            + this.stringifyCoords(layer.getLatLng(), isLatLng, page) + ","
                            + layer.getRadius() / 1000 + ")";

                    } else if (layer instanceof L.Rectangle
                        || layer instanceof L.LatLngBounds) {
                        var bounds = layer;
                        if (!(layer instanceof L.LatLngBounds)) {
                            bounds = layer.getBounds();
                        }

                        wkt = GEOMETRY.RECTANGLE + "("
                            + self.stringifyCoords(bounds.getSouthWest(), isLatLng, page)
                            + ","
                            + self.stringifyCoords(bounds.getNorthEast(), isLatLng, page)
                            + ")";

                    } else if (layer instanceof L.Polyline) {
                        var latlngs = layer.getLatLngs();
                        var strings = [];
                        var processCoords = function (latlng, coords) {
                            coords.push(self.stringifyCoords(latlng, isLatLng, page));
                        }
                        var isMulti = false;
                        var arrayOfArray = false;
                        latlngs.forEach(function (item, index) {
                            if (item instanceof Array) {
                                arrayOfArray = true;
                                var coords = [];
                                item.forEach(function (latlng) {
                                    processCoords(latlng, coords);
                                })
                                if (layer instanceof L.Polygon) {
                                    if ((item[0].lat != item[item.length - 1].lat) || (item[0].lng != item[item.length - 1].lng)) {
                                        coords.push(coords[0]);
                                    }
                                }
                                if (coords.length > 0) {
                                    strings.push(coords.join(","));
                                    isMulti = strings.length > 1;
                                }

                            } else {
                                processCoords(item, strings);
                            }
                        });

                        if (isMulti) {
                            logger.info("multiple polylines or polygons are not handled");
                            return "";
                        }
                        var string = "";
                        if (!arrayOfArray) {
                            if (layer instanceof L.Polygon) {
                                if ((latlngs[0].lat != latlngs[latlngs.length - 1].lat) || (latlngs[0].lng != item[latlngs.length - 1].lng)) {
                                    strings.push(string[0]);
                                }

                            }
                            string = [strings.join(",")];

                        } else {
                            string = strings[0];
                        }
                        if (layer instanceof L.Polygon) {
                            wkt = GEOMETRY.POLYGON + "((" + string + "))";
                        } else {
                            wkt = GEOMETRY.POLYLINE + "(" + string + ")";
                        }
                    } else {
                        logger.log("unhandled geometry");
                    }
                }
                return wkt;

            },

            wktToGeoJson: function (wkt) {
                var geometry = wkt.substr(0, pos).toUpperCase();
                var coords;
                try {
                    coords = JSON.parse(this.prepareCoordinates(wkt.substr(pos), true));

                } catch (e) {
                    logger.error("invalid wkt '" + coords + "'");

                }
                var geojson;
                if (geometry == 'circle') {
                    geojson = {
                        type: 'circle',
                        coordinates: coords[0],
                        radius: coords[1]
                    };
                } else if (geometry == 'rectangle') {
                    geojson = {
                        type: 'rectangle',
                        coordinates: (coords.length == 1) ? [
                            [coords[0], coords[2]], [coords[1], coords[3]]]
                            : coords
                    };
                } else {
                    geojson = {
                        type: geometry,
                        coordinates: coords
                    }
                }
                return JSON.stringify(geojson);
            },
            isValidWkt: function (wkt) {
                if (!this.regexWkt) {
                    var regexUnsignedDouble = "([0-9]*.)?[0-9]+(?:[eE][+\\-]?\\d+)?";
                    var regexDouble = "[+\\-]?"+regexUnsignedDouble;
                    var regexCoord = regexDouble + "\\s+" + regexDouble;
                    var regexCoordsArray = "\\((?:\\s*" + regexCoord + "\\s*,)+(?:\\s*" + regexCoord + ")\\s*\\)";

                    var regexCircle = "CIRCLE\\s*\\(\\s*" + regexCoord + "\\s*,\\s*" + regexUnsignedDouble + "\\s*\\)";
                    var regexPoint = "POINT\\s*\\(\\s*" + regexCoord + "\\s*\\)";
                    var regexRectangle = "RECTANGLE\\s*\\(\\s*" + regexCoord + "\\s*,\\s*" + regexCoord + "\\s*\\)";
                    var regexPolygonOrLineString = "(?:POLYGON|LINESTRING)\\s*\\(" + regexCoordsArray + "\\)";

                    var regexWkt = new RegExp("^\\s*(?:" + regexPoint + ")|(?:" + regexCircle + ")|(?:" + regexRectangle + ")|(?:" + regexPolygonOrLineString + ")\\s*$");
                    this.regexWkt = regexWkt;
                }
                return this.regexWkt.test(wkt);
            }
            
        }
    }
    if (typeof module !== "undefined") {
        module.exports = initParser;
    } else {
        initParser(window);
    }
})(this)