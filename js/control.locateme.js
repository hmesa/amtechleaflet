
(function (global) {
    if (!global.amtech) {
        global, amtech = {};
    }
    var amtech = global.amtech;
    if (!amtech.console) {
        amtech.console = {};
    }
    if (!amtech.I18N) {
        amtech.I18N = {};
    }
    if (!amtech.I18N.MAP) {
        amtech.I18N.MAP = {};
    }
    const MAP = {
        "LocateMe": "Detect my position",
    };
    for (var key in MAP) {
        if (!(key in amtech.I18N.MAP)) {
            amtech.I18N.MAP[key] = MAP[key];
        }
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
    amtech.console.defineLocateMySelfControl = function (L) {
        L.Control.LocateMySelf = L.Control
            .extend({
                options: {
                    position: 'bottomright'
                },
                onAdd: function (map) {
                    var controlDiv = L.DomUtil.create('div', 'leaflet-bar');
                    L.DomEvent.addListener(controlDiv, 'click',
                        L.DomEvent.stopPropagation).addListener(controlDiv,
                            'click', L.DomEvent.preventDefault).addListener(
                                controlDiv, 'click', this.locate, this);

                    var controlUI = L.DomUtil.create('a', 'map-locate-myself',
                        controlDiv);
                    controlUI.title = getMessage("LocateMe");

                    controlUI.href = '#';
                    return controlDiv;
                },
                locate: function () {
                    if (this._map) {
                        this._map.locate({
                            setView: true,
                            maxZoom: 15
                        });

                    }
                }
            });
    }
})(window);