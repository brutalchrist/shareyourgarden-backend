/**
 * GardensController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {
  find: function(req, res) {
    const polygon = req.param('polygon');

    if (typeof polygon === 'undefined') {
      Gardens.find().exec(function (error, result) {
        return res.json(result);
      });
    }

    try {
      var coordinates = JSON.parse(polygon);
    } catch(e) {
      res.status(409);
      return res.json({error: 'polygon: an array was expected'});
    }

    if (!Array.isArray(coordinates)) {
      res.status(409);
      return res.json({error: 'polygon: an array was expected'});
    }

    if (coordinates.length < 4) {
      res.status(409);
      return res.json({error: 'polygon: a minimum of 4 points was expected'});
    }

    var query = {
      location: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [ coordinates ]
          }
        }
      }
    };

    const db = Gardens.getDatastore().manager;
    const gardenCollection = db.collection(Gardens.tableName);

    gardenCollection.find(query).toArray(function(mongoErr, docs) {
      if (mongoErr) {
        return res.json(mongoErr);
      }

      return res.json(docs);
    });
  }
};

