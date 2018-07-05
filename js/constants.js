(function (global) {
 const PATH_TYPES= "/amtech/linkeddata/types/composite";
 const PATH_ENTITIES= "/amtech/things/entities";
 
    var getThingId = function (typeName, name) {
        return PATH_ENTITIES + "/" + typeName + "/" + name;

    };
    var getThingTypeUrl = function (typeName) {
        return PATH_TYPES + "/entity/" + typeName;

    };
    global.CONSTANTS = {
        FIELDS: {
            NAME: "_name",
            ID: "@id",
            TYPE: "@type",
            LOCATION: "location"
        },
        PATHS: {
            TYPES: PATH_TYPES,
            ENTITIES: PATH_ENTITIES,
            TRACKERS:PATH_ENTITIES+"/smartTracker",
            ROOT:"/amtech",

            TYPE_ENTITY:getThingTypeUrl(""), 
            TYPE_TRACKER:getThingTypeUrl("smartTracker"),
            TYPE_GEOFENCE: getThingTypeUrl("geofence"),
            TYPE_M2MBRIDGE: getThingTypeUrl("amtechM2mBridge")
        },
        getThingId: getThingId,
        getThingTypeUrl: getThingTypeUrl,
        getCollectionMembers: function (object) {
            if (Array.isArray(object)) {
                return object;
            } else if (Array.isArray(object.members)) {
                return object.members;
            }
            return [];
        }
    }
})(window);