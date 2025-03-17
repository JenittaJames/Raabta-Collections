const couponModel = require("../../models/couponSchema");
const mongoose = require('mongoose')

const loadCoupon = async (req, res) => {
  try {

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.query) {
      query = {
        couponCode: { $regex: new RegExp(req.query.query, "i") },
      };
    }

    const coupons = await couponModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCoupons = await couponModel.countDocuments(query);
    const totalPages = Math.ceil(totalCoupons / limit);

    res.render("admin/coupon", {
      coupons,
      currentPage: page,
      totalPages,
      searchQuery: req.query.query || "",
    });
  } catch (error) {
    console.log("error occured while rendering coupon page", error);
  }
};

const addCoupon = async (req, res) => {
  try {
    const coupon = await couponModel.find();
    res.render("admin/addcoupon", { coupon });
  } catch (error) {
    console.log("Add product error", error);
  }
};

const addCouponPost = async (req, res) => {
  try {
    const {
      couponCode,
      type,
      discount,
      minimumPrice,
      maxRedeem,
      expiry,
      status,
    } = req.body;

    const couponExisting = await couponModel.findOne({
      couponCode: couponCode.toUpperCase(),
    });

    if (couponExisting) {
      return res.status(400).render("admin/addcoupon", {
        error: "Coupon code already exists",
        formData: req.body,
      });
    }

    const newCoupon = new couponModel({
      couponCode: couponCode.toUpperCase(),
      type,
      discount: parseFloat(discount),
      minimumPrice: parseFloat(minimumPrice),
      maxRedeem: parseInt(maxRedeem),
      expiry: new Date(expiry),
      status: status === "true",
    });

    await newCoupon.save();
    res.redirect("/admin/coupon");
  } catch (error) {
    console.log("error occured while adding coupons", error);
  }
};



const editCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).redirect('/admin/coupons');
        }
        
        const coupon = await couponModel.findById(couponId);
        
        if (!coupon) {
            return res.status(404).redirect('/admin/coupons');
        }
        
        res.render('admin/editcoupon', { coupon });
    } catch (error) {
        console.error('Error fetching coupon for edit:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};



const editCouponPost = async (req, res) => {
    try {
        const couponId = req.params.id;
        const { couponCode, type, discount, minimumPrice, maxRedeem, expiry, status } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).redirect('/admin/coupon');
        }
        
        // Check if updated coupon code already exists (excluding this coupon)
        const existingCoupon = await couponModel.findOne({
            couponCode: couponCode.toUpperCase(),
            _id: { $ne: couponId }
        });
        
        if (existingCoupon) {
            return res.status(400).render('admin/editcoupon', {
                error: 'Coupon code already exists',
                coupon: { ...req.body, _id: couponId }
            });
        }
        
        const updatedCoupon = await couponModel.findByIdAndUpdate(
            couponId,
            {
                couponCode: couponCode.toUpperCase(),
                type,
                discount: parseFloat(discount),
                minimumPrice: parseFloat(minimumPrice),
                maxRedeem: parseInt(maxRedeem),
                expiry: new Date(expiry),
                status: status === 'true'
            },
            { new: true }
        );
        
        if (!updatedCoupon) {
            return res.status(404).redirect('/admin/coupon');
        }
        
        res.redirect('/admin/coupon');
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).render('error', { message: 'Internal server error' });
    }
};



const toggleCouponStatus = async (req, res) => {
    try {
        const couponId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(400).json({ success: false, message: 'Invalid coupon ID' });
        }
        
        const coupon = await couponModel.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }
        
        coupon.status = !coupon.status;
        await coupon.save();
        
        res.status(200).json({
            success: true,
            status: coupon.status,
            message: `Coupon ${coupon.status ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};



module.exports = {
  loadCoupon,
  addCoupon,
  addCouponPost,
  editCoupon,
  editCouponPost,
  toggleCouponStatus,
};
