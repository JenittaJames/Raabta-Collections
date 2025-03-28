
const offerModel = require("../../models/offerSchema");



const getProductOffers = async (req, res) => {
  try {
    const productId = req.params.productId;
    
    const productOffers = await offerModel.find({
      status: true,
      offerType: 'product',
      productId: productId,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { maxUses: null },
        { maxUses: { $gt: "$usedCount" } }
      ]
    }).sort({ discount: -1 });
    
    res.json(productOffers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};



const getCategoryOffers = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    

    const categoryOffers = await offerModel.find({
      status: true,
      offerType: 'category',
      categoryId: categoryId,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { maxUses: null },
        { maxUses: { $gt: "$usedCount" } }
      ]
    }).sort({ discount: -1 });
    
    res.json(categoryOffers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};



const getReferralOffers = async (req, res) => {
  try {
    const referralOffers = await offerModel.find({
      status: true,
      offerType: 'referral',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { maxUses: null },
        { maxUses: { $gt: "$usedCount" } }
      ]
    });
    
    res.json(referralOffers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};




module.exports = {
  getProductOffers,
  getCategoryOffers,
  getReferralOffers
};