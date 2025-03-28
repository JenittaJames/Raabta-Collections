const offerModel = require("../../models/offerSchema");
const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const userModel = require("../../models/userSchema");
const mongoose = require("mongoose");
const crypto = require("crypto");

const getOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.query) {
      query = {
        offerName: { $regex: req.query.query, $options: "i" },
      };
    }

    const offers = await offerModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "productName")
      .populate("categoryId", "name");

    const totalOffers = await offerModel.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    res.render("admin/offer", {
      offers,
      currentPage: page,
      totalPages,
      searchQuery: req.query.query || "",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const getAddOfferPage = async (req, res) => {
  try {
    const products = await productModel.find({ status: true }).select({ productName: 1, _id: 1 }).lean();
    const categories = await catModel.find({ status: true }).select({ name: 1, _id: 1 }).lean();

    res.render("admin/addoffer", {
      products,
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const createOffer = async (req, res) => {
  try {
    const { offerName, discount, startDate, endDate, offerType, productId, categoryId } = req.body;

    const newOffer = new offerModel({
      offerName,
      discount: parseFloat(discount),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      offerType,
    });

    if (offerType === "product" && productId) {
      newOffer.productId = Array.isArray(productId) ? productId : [productId];
    }

    if (offerType === "category" && categoryId) {
      newOffer.categoryId = Array.isArray(categoryId) ? categoryId : [categoryId];
    }

    await newOffer.save();

    res.redirect("/admin/offer");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const getEditOfferPage = async (req, res) => {
  try {
    const offerId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).send("Invalid offer ID");
    }

    const offer = await offerModel
      .findById(offerId)
      .populate("productId", "productName")
      .populate("categoryId", "name _id");

    if (!offer) {
      return res.status(404).send("Offer not found");
    }

    const products = await productModel.find({ status: true }).select({ productName: 1, _id: 1 }).lean();
    const categories = await catModel.find({ status: true }).select({ name: 1, _id: 1 }).lean();

    res.render("admin/editoffer", {
      offer,
      products,
      categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const updateOffer = async (req, res) => {
  try {
    const offerId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).send("Invalid offer ID");
    }

    const { offerName, discount, startDate, endDate, offerType, productId, categoryId } = req.body;

    const updateData = {
      offerName,
      discount: parseFloat(discount),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      offerType,
    };

    if (offerType === "product") {
      updateData.productId = Array.isArray(productId) ? productId : productId ? [productId] : [];
      updateData.categoryId = [];
    }

    if (offerType === "category") {
      updateData.categoryId = Array.isArray(categoryId) ? categoryId : categoryId ? [categoryId] : [];
      updateData.productId = [];
    }

    await offerModel.findByIdAndUpdate(offerId, updateData);

    res.redirect("/admin/offer");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const toggleOfferStatus = async (req, res) => {
  try {
    const offerId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).json({ success: false, message: "Invalid offer ID" });
    }

    const offer = await offerModel.findById(offerId);

    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    offer.status = !offer.status;
    await offer.save();

    res.json({
      success: true,
      status: offer.status,
      message: `Offer ${offer.status ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Generate referral code for user
const generateReferralCode = (userId) => {
  const randomBytes = crypto.randomBytes(3).toString("hex");
  return `REF${userId.substring(0, 5)}${randomBytes}`.toUpperCase();
};

// Handle referral reward by adding Rs.500 to referrer's wallet
const handleReferralReward = async (referrerId) => {
  try {
    // Find an active referral offer
    const referralOffer = await Offer.findOne({
      status: true,
      offerType: 'referral',
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { maxUses: null },
        { maxUses: { $gt: "$usedCount" } }
      ]
    });

    if (!referralOffer) {
      console.log('No active referral offer found');
      return false;
    }

    // Update referrer's wallet and track referral reward
    const referrer = await User.findByIdAndUpdate(
      referrerId,
      {
        $inc: { wallet: referralOffer.discount || 300 },
        $push: {
          referralRewards: {
            offerId: referralOffer._id,
            dateIssued: new Date(),
            used: false
          }
        }
      },
      { new: true }
    );

    // Update offer's used count
    await Offer.findByIdAndUpdate(
      referralOffer._id,
      { $inc: { usedCount: 1 } }
    );

    // Create wallet transaction
    await walletModel.findOneAndUpdate(
      { userId: referrerId },
      {
        $inc: { balance: referralOffer.discount || 300 },
        $push: {
          transaction: {
            amount: referralOffer.discount || 300,
            type: 'credit',
            description: 'Referral Bonus',
            date: new Date()
          }
        }
      }
    );

    return referrer;
  } catch (error) {
    console.error('Error in createReferralReward:', error);
    return false;
  }
};

module.exports = {
  getOffers,
  getAddOfferPage,
  createOffer,
  getEditOfferPage,
  updateOffer,
  toggleOfferStatus,
  generateReferralCode,
  handleReferralReward,
};