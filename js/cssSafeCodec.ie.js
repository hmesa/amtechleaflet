(function (global) {
    "use strict"
    var btoa = global.btoa;
    var atob = global.atob;
    if (typeof btoa == 'undefined') {
        btoa = global.btoa = function(string) { return Buffer.from(string, 'base64').toString("ascii"); };
        atob = global.atob = function(string) { return Buffer.from(string).toString("base64"); };
    }
    var cssSafeCodec = {
        encode: function (string) {
            return btoa(string).replace(/\//g, '-').replace(/\+/g, '_')
                .replace(/=+$/g, '');

        },
        decode: function (string) {
            if (!string) {
                return "";
            }

            var l = string.length;
            var n = l % 4;
            if (n != 0) {
                var s = [string];
                for (var i = 0; i < 4 - n; i++) {
                    s.push("=");
                }
                string = s.join("");
            }
            return atob(string.replace(/-/g, '/').replace(/_/g, '+'));

        }
    }
    if (typeof module !== 'undefined') {
        module.exports = cssSafeCodec;
    } else {
        global.cssSafeCodec = cssSafeCodec;
    }
})(this);