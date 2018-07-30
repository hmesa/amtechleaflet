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
        cssSafeCodec = window.cssSafeCodec = require("./cssSafeCodec.js");
    }
    var DOMURL = (typeof window != "undefined") ? (window.URL || window.webkitURL || window) : undefined;
    class ImageHandler {

        constructor(imageContentGatheringFcn, logger) {
            var baseUrl = "/amtech/linkeddata/types/composite/entity";
            var escapedUrl = "^" + baseUrl.replace("/", "\\/");
            var nameRegexp = "[^\\/]+";
            var fieldRegexp = "^typesvgicon$";

            this.PATTERN_BASE_URL = new RegExp(escapedUrl); // base url
            this.PATTERN_INSTANCE_URL = new RegExp(escapedUrl + "\\/" + nameRegexp
                + "$"); // instance url pattern
            this.PATTERN_BASE_FIELD_URL = new RegExp(escapedUrl + "\\/" + nameRegexp
                + "\\/" + fieldRegexp + "$"); // instance field url pattern
            this.CLASS_PREFIX = "typesvgicon";

            this.imageFieldForClass = "typesvgicon";
            if (typeof imageContentGatheringFcn == "function") {
                this.__setImageContentGatheringFcn(imageContentGatheringFcn);
            } else if (Object.prototype.isPrototypeOf(imageContentGatheringFcn)) {
                this.setDapClient(imageContentGatheringFcn);
            }
            this.setLogger(logger);
        }
        setDapClient(dapClient) {
            var imageContentGatheringFcn = undefined;
            if (typeof dapClient != "undefined") {
                imageContentGatheringFcn = (url, binary) => {
                    return (binary ? dapClient.getBinaryResource(url) : dapClient.get(url));
                }
            }
            this.__setImageContentGatheringFcn(imageContentGatheringFcn);
        }

        releaseImage(imageObjectUrl) {
            DOMURL.revokeObjectURL(imageObjectUrl);
        }
        setCssStyleContainerDiv($div) {
            this.stylesContainerDiv = $div;
        }
        //#region Gathering function
        __getImageContentGatheringFcn() {
            return this.__imageContentGatheringFcn;
        }
        __setImageContentGatheringFcn(imageContentGatheringFcn) {
            if (typeof imageContentGatheringFcn == "function") {
                this.__imageContentGatheringFcn = imageContentGatheringFcn;
            } else {
                this.__imageContentGatheringFcn = undefined;
            }
        }
        //#endregion
        /**/

        //#region Logger
        setLogger(logger) {
            this.logger = logger || console;
        }
        __log() {
            if (this.logger) {
                var level = Array.prototype.shift.call(arguments);
                if (typeof this.logger[level] == "function") {
                    if (level != "debug" || (typeof this.logger.isDebugEnabled == "undefined") || this.logger.isDebugEnabled()) {
                        this.logger[level].apply(this.logger, arguments);
                    }
                } else {
                    console.log("The logger does not handle the given level " + level);
                }
            }
        }
        //#endregion
        /**/

        //#region Class names
        getImageCssClassName(url) {
            if (this.PATTERN_INSTANCE_URL.test(url)) {
                var fieldName = this.imageFieldForClass;
                var suffix = (!fieldName) ? "" : "-" + fieldName;
                return this.CLASS_PREFIX
                    + "-"
                    + cssSafeCodec.encode(url.replace(
                        this.PATTERN_BASE_URL, "")) + suffix;
            }
            return "";
        }
        setClassForUrl(url, className, useImageInsteadOfUrls) {
            if (!url || url.length == 0) {
                this.__log("error","missing url ");
                return Promise.reject();
            }
            if (className == undefined) {
                className = this.getImageCssClassName(url);
            }
            if (className.length > 0) {
                var promise = ((!useImageInsteadOfUrls) ? Promise.resolve(url) : this.getEntityImageFromUrl(url))
                     .then((response) => {
                        if (response && response.length > 0) {
                            return {
                                className: className,
                                id:response,
                                content: this.getCssContentForUrl(response)
                            };
                        } else {
                            return undefined;
                        }
                    });

                return promise.then((classData) => {
                    if (!classData) {
                        return undefined;
                    }

                    if (this.stylesContainerDiv) {
                        var containerDiv = this.stylesContainerDiv;
                        var string = "." + classData.className + "{ content:" + classData.content + ";}";
                        var styleId = "entityClass_" + className;
                        var style = containerDiv.find("#" + styleId);
                        if (style.length == 0) {
                            containerDiv.append("<style id=\"" + styleId + "\">" + string
                                + ";</style>");
                        } else {
                            style.html(string);
                        }
                    }else{
                        this.__log("debug","Css container div has not been set");
                    }
                    return classData;
                });
            } else {
                return Promise.resolve();
            }
        }
       

        //#endregion
        /**/

        //#region content
        getCssContentForSVG(svg, charset) {
            charset = (charset || "utf8");
            return "url('data:image/svg+xml;" + charset + "," + svg.content + "')";
        }
        getCssContentForUrl(url) {
            return "url('" + url.replace(/([^\\])'/g, "$1\\'") + "')";
        }
        getImageUrlFromResourceUri(url) {
            if (!url || url.length == 0) {
                return undefined;
            } else {
                var imageUrl = url;
                if (url.startsWith(window.CONSTANTS.PATHS.TYPE_ENTITY)) {
                    imageUrl += (url.indexOf("?") > 0 ? "&" : "?") + "property=" + this.imageFieldForClass + "&mtype=image%2Fsvg%2Bxml";
                }
                return imageUrl;
            }

        }

        getImageCssContentFromUrl(typeUrl) {
            var imageUrl = typeUrl + (typeUrl.indexOf("?") > 0 ? "&" : "?") + "property=" + this.imageFieldForClass;
            return this.getExternalResource(imageUrl).then((response) => {
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
        }

        getImageFromUrl(imageUrl) {
            return this.getExternalResource(imageUrl, true).then((response) => {

                if (response.type == "data") {
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
                    return response.data;
                }
            });
        }
        getEntityImageFromUrl(typeUrl) {
            var imageUrl = typeUrl + (typeUrl.indexOf("?") > 0 ? "&" : "?") + "property=" + this.imageFieldForClass;
            return this.getExternalResource(imageUrl).then((response) => {
                var data = response.data;
                if (response.type == "data") {
                    var contentType = response.contentType;
                    var svg = new Blob([data], { type: "image/svg+xml" });
                    return DOMURL.createObjectURL(svg);

                } else {
                    return response.data;
                }
            });
        }
        //#endregion
        /**/

        //#region gathering functions
        getExternalResource(url, binary) {
            var result = { type: "url", data: url };
            var gatheringFcn = this.__getImageContentGatheringFcn();
            if (gatheringFcn) {
                var promise = Promise.resolve(gatheringFcn(url, binary))
                    .then((response) => {
                        this.__log("debug", "================> read successful");
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
                }).catch((response) => {
                        this.__log("info", "image read unsuccessful.", response.message || response, (response.statusCode) ? "(Code " + response.statusCode + ")" : "");

                    return result;
                });
            } else {
                promise = Promise.resolve(result);
            }
            return promise;
        }
        //#endregion
        /**/
    }
    if (typeof module !== "undefined") {
        module.exports = ImageHandler;
    } else {
        window.ImageHandler = ImageHandler;
    }
})(this);