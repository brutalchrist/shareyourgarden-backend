/**
 * GardensController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

module.exports = {
  find: function(req, res) {
    const polygon = req.param('polygon');
    const where = req.param('where') || '';

    if (typeof polygon === 'undefined') {
      Gardens.find().exec((error, result) => {
        return res.json(result);
      });
    }

    try {
      const coordinates = JSON.parse(polygon);

      if (!Array.isArray(coordinates)) {
        res.status(409);
        return res.json({error: 'polygon: an array was expected'});
      }

      if (coordinates.length < 4) {
        res.status(409);
        return res.json({error: 'polygon: a minimum of 4 points was expected'});
      }


      const $regex = `.*${where}.*`;
      const $options = 'i';

      var query = {
        $or: [
          { name: { $regex, $options }},
          { 'products.name': { $regex, $options }},
          { 'products.type': { $regex, $options }},
          { 'owner.name': { $regex, $options }}
        ],
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

      gardenCollection.find(query).toArray((mongoErr, docs) => {
        if (mongoErr) {
          return res.json(mongoErr);
        }

        return res.json(docs);
      });
    } catch(e) {
      res.status(409);
      return res.json({error: 'polygon: an array was expected'});
    }
  }
};

