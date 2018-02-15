/*
 *  Copyright (c) 2014-2015 amTech
 *  *
 *  * This file is subject to the terms and conditions defined in file 'LICENSE',
 *  * which is part of this source code package.
 */

(function (window) {
    "use strict";
    var cssSafeCodec = window.cssSafeCodec;
    if (typeof cssSafeCodec == "undefined" && typeof require == "function") {
        cssSafeCodec = window.cssSafeCodec = require('./cssSafeCodec.js');
    }
    var DOMURL = (typeof window != 'undefined') ? (window.URL || window.webkitURL || window) : undefined;
    var ImageHandler = window.Class.extend({
        init: function (dapClient, logger) {
            var baseUrl = "/amtech/linkeddata/types/composite/entity";
            var escapedUrl = '^' + baseUrl.replace('/', '\/');
            var nameRegexp = '[^\/]+';
            var fieldRegexp = '^typesvgicon$';

            this.PATTERN_BASE_URL = new RegExp(escapedUrl); // base url
            this.PATTERN_INSTANCE_URL = new RegExp(escapedUrl + '\/' + nameRegexp
                + '$'); // instance url pattern
            this.PATTERN_BASE_FIELD_URL = new RegExp(escapedUrl + '\/' + nameRegexp
                + '\/' + fieldRegexp + '$'); // instance field url pattern
            this.CLASS_PREFIX = 'typesvgicon';

            this.imageFieldForClass = 'typesvgicon';
            this.dapClient = dapClient;
            this.setLogger(logger);
        },
        setLogger: function (logger) {
            this.logger = logger || console;
        },
        getImageCssClassName: function (url) {
            if (this.PATTERN_INSTANCE_URL.test(url)) {
                var fieldName = this.imageFieldForClass;
                var suffix = (!fieldName) ? "" : "-" + fieldName;
                return this.CLASS_PREFIX
                    + "-"
                    + cssSafeCodec.encode(url.replace(
                        this.PATTERN_BASE_URL, '')) + suffix;
            }
            return '';
        },
        getCssContentForSVG: function (svg, charset) {
            charset = (charset || 'utf8');
            return 'url(\'data:image/svg+xml;' + charset + ',' + svg.content + '\')';
        },
        getCssContentForUrl: function (url) {
            return 'url(\'' + url.replace(/([^\\])'/g, "$1\\'") + '\')';
        },
        getImageCssContentFromUrl: function (typeUrl) {
            var imageUrl = typeUrl + (typeUrl.indexOf("?") > 0 ? "&" : "?") + "property=" + this.imageFieldForClass;
            return this.getExternalResource(imageUrl).then(function(response) {
                var data = response.data;
                var contentType, charset, content = data;
                if (data) {
                    if (data.contentType) {
                        contentType = data.contentType;
                        content = data.content;

                        if (data.contentType) {
                            contentType = data.contentType;
                        }
                    }
                }
                if (response.type == "data") {
                    return this.getCssContentForSVG(content, charset);
                } else if (response.type == "url") {
                    return this.getCssContentForUrl(content);
                } else {
                    return Promise.reject(new Error("Unexpected response data type " + response.type + " for data " + response.data));
                }
            })
        },
        getExternalResource: function (url, binary) {
            var result = { type: "url", data: url };
            if (!this.dapClient) {
                return Promise.resolve(result);
            } else {
                var logger = this.logger;
                return (binary ? this.dapClient.getBinaryResource(url) : this.dapClient.get(url)).then(function(response) {
                    logger.debug("================> read successful")
                    if (!response) {
                        throw new Error("Unexpected empty response for image");
                    } else {
                        var data = response.content;
                        var content = data;
                        var contentType, charset;
                        if (data && response.contentType) {
                            contentType = response.contentType;
                            content = response.content;
                            charset = response.charset;
                        }
                        return { type: "data", data: content, contentType: contentType, charset: charset };
                    }
                }).catch(function(response) {
                    logger.info("image read unsuccessful.", response.message || response, (response.statusCode) ? "(Code " + response.statusCode + ")" : "");

                    return result;
                });
            }
        },
        releaseImage: function (imageObjectUrl) {
            DOMURL.revokeObjectURL(imageObjectUrl);
        },
        getImageFromUrl: function (imageUrl) {
            var imageUrl = imageUrl;
            return this.getExternalResource(imageUrl, true).then(function(response) {

                if (response.type == 'data') {
                    //we need to set the content type and the data
                    var data = response.data;
                    var image = data;
                    if (!(data instanceof Blob)) {
                        if (!response.contentType || !data) {
                            return Promise.reject(new Error("missing image content or image type"))
                        }

                        var contentType = response.contentType;
                        var charset = response.charset;
                        image = new Blob([data], { type: contentType + ((charset) ? "; charset=" + charset : "") });
                    }
                    return DOMURL.createObjectURL(image);

                } else {
                    return response.data
                }
            });
        },
        getEntityImageFromUrl: function (typeUrl) {
            var imageUrl = typeUrl + (typeUrl.indexOf("?") > 0 ? "&" : "?") + "property=" + this.imageFieldForClass;
            return this.getExternalResource(imageUrl).then(function(response) {
                var data = response.data;
                if (response.type == 'data') {
                    var contentType = response.contentType;
                    var svg = new Blob([data], { type: 'image/svg+xml' });
                    return DOMURL.createObjectURL(svg);

                } else {
                    return response.data
                }
            });
        },
        setClassForUrl: function (url, className, useImageInsteadOfUrls) {
            var self=this;
            if (!url || url.length == 0) {
                logger.error("missing url ");
                return Promise.reject();
            }
            if (className == undefined) {
                className = this.getImageCssClassName(url);
            }
            if (className.length > 0) {
                var promise = (!!useImageInsteadOfUrls) ? this.getEntityImageFromUrl(url) : Promise.resolve(url);
                return promise.then(function(response) {

                    if (!self.stylesContainerDiv) {
                        logger.log("Css container div has not been set");
                        return false;
                    }
                    if (response && response.length > 0) {
                        var string = '.' + className + '::before{ content:' + self.getCssContentForUrl(response) + ';}';
                        var styleId = 'entityClass_' + className;
                        var style = self.stylesContainerDiv.find('#' + styleId);
                        if (style.length == 0) {
                            self.stylesContainerDiv.append('<style id="' + styleId + '">' + string
                                + ';</style>');
                        } else {
                            style.html(string);
                        }
                        return true;
                    }
                    return false;
                });
            } else {
                return Promise.resolve(false);
            }
        },
        setCssStyleContainerDiv: function ($div) {
            this.stylesContainerDiv = $div;
        }
    });
    if (typeof module !== "undefined") {
        module.exports = ImageHandler;
    } else {
        window.ImageHandler = ImageHandler;
    }
})(this);