const User = require("../../models/userSchema");
const walletModel = require("../../models/walletSchema");
const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const offerModel = require("../../models/offerSchema")
const { handleReferralReward } = require('../../controller/admin/offerController')
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const crypto = require('crypto');
const nodemailer = require("nodemailer");

dotenv.config();


const generateReferralCode = (userId) => {
  const randomBytes = crypto.randomBytes(3).toString("hex");
  return `REF${userId.substring(0, 5)}${randomBytes}`.toUpperCase();
};

// Helper Functions
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    throw new Error("Failed to send verification email");
  }
}

// Home Page
const loadHomepage = async (req, res) => {
  try {
    // Fetch categories
    const categories = await catModel.find({});

    // Fetch active products
    const products = await productModel.find({ status: true });

    // Fetch active offers (status: true, within date range)
    const activeOffers = await offerModel.find({
      status: true,
      startDate: { $lte: new Date() }, // Offers that have started
      endDate: { $gte: new Date() }    // Offers that haven't ended
    })
    .populate('productId', 'productName') // Populate product details if offer type is 'product'
    .populate('categoryId', 'name');      

    let userWishlist = [];
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      userWishlist = user ? user.wishlist.map(id => id.toString()) : [];
    }

    // Render the home page with categories, products, and offers
    res.render("user/home", { 
      categories, 
      products, 
      offers: activeOffers,
      userWishlist

    });
  } catch (error) {
    console.error("Error while loading homepage:", error);
    res.status(500).send("Internal Server Error");
  }
};



const loadShop = async (req, res) => {
  try {
    const { query, sort } = req.query;
    const searchQuery = query || "";
    const sortOption = sort || "";

    // Fetch all active categories
    const activeCategories = await catModel.find({ status: true }).select('_id');
    const activeCategoriesId = activeCategories.map(cat => cat._id);

    // Create search filter with both product status and category check
    const searchFilter = {
      status: true,
      category: { $in: activeCategoriesId } // Only include products from active categories
    };

    if (searchQuery) {
      searchFilter.$or = [
        { productName: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
      ];
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    // Sorting logic
    let sortCriteria = { createdAt: -1 }; // Default sort by newest
    switch(sortOption) {
      case 'a-z':
        sortCriteria = { productName: 1 }; // Ascending by name
        break;
      case 'z-a':
        sortCriteria = { productName: -1 }; // Descending by name
        break;
      case 'l-h':
        sortCriteria = { price: 1 }; // Ascending by price
        break;
      case 'h-l':
        sortCriteria = { price: -1 }; // Descending by price
        break;
    }

    const totalProducts = await productModel.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await productModel.find(searchFilter)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);

    const categories = await catModel.find({ status: true });

    // Fetch active offers
    const activeOffers = await offerModel.find({
      status: true,
      startDate: { $lte: new Date() }, // Offers that have started
      endDate: { $gte: new Date() }    // Offers that haven't ended
    })
      .populate('productId', 'productName')
      .populate('categoryId', 'name');     

    let userWishlist = [];
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      userWishlist = user ? user.wishlist.map(id => id.toString()) : [];
    }

    res.render("user/shop", {
      products,
      searchQuery: searchQuery,
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      offers: activeOffers,
      userWishlist,
      sort: sortOption // Pass the sort option to the view
    });
  } catch (error) {
    console.error("Error loading shop page:", error);
    res.status(500).send("Internal Server Error");
  }
};


const shopByFilter = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    
    const categories = await catModel.find();
    
    const totalProducts = await productModel.countDocuments({ category: categoryId, status: true });
    const totalPages = Math.ceil(totalProducts / limit);
    
    const products = await productModel.find({ category: categoryId, status: true })
      .skip(skip)
      .limit(limit);
    
    const currentCategory = await catModel.findById(categoryId);
    
    res.render('user/shopbyfilter', {
      products, 
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      categoryId,
      currentCategory: currentCategory || { name: 'Selected Category' }
    });
  } catch (error) {
    console.log("Error occurred while rendering shop by filter page", error);
    res.status(500).send("Internal Server Error");
  }
};

// Registration Flow
const loadRegister = async (req, res) => {
  try {
    return res.render("user/register");
  } catch (error) {
    console.log("Error while rendering Register page", error);
    res.status(500).send("Server error");
  }
};

const register = async (req, res) => {
  try {
    const { userName, email, phone, password, confirmPassword, referralCode } = req.body;

    if (password !== confirmPassword) {
      return res.render("user/register", { message: "Passwords do not match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("user/register", {
        message: "User with this email already exists",
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send verification email" });
    }

    req.session.userData = { userName, email, phone, password, referralCode };
    req.session.userOtp = otp;

    console.log("OTP Sent", otp);
    return res.redirect("/otp");
  } catch (error) {
    console.error("Error occurred while Registration", error);
    return res.redirect("/pageNotFound");
  }
};


const loadOtpPage = async (req, res) => {
  try {
    res.render("user/otp", { type: "register" });
  } catch (error) {
    console.log("OTP page not found.....", error);
    res.status(500).send("Server error");
  }
};

const resendOtp = async (req, res) => {
  try {
    if (!req.session.userData || !req.session.userData.email) {
      req.flash('error_msg', "Session expired. Please try again");
    }

    const email = req.session.userData.email;
    const newOtp = generateOtp();

    const emailSent = await sendVerificationEmail(email, newOtp);

    if (emailSent) {
      req.session.userOtp = newOtp;
      console.log(`OTP resent successfully: ${newOtp}`);
      req.flash('success_msg', "OTP resent successfully");
    } else {
      req.flash('error_msg', "Failed to send verification mail");
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    req.flash('error_msg', "Failed to resent OTP");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userOtp || !req.session.userData) {
      req.flash('error_msg', "Session expired. Please request a new OTP");
    }

    if (otp === req.session.userOtp) {
      const { userName, email, phone, password, referralCode } = req.session.userData;

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        userName,
        email,
        phone,
        password: hashedPassword,
        isVerified: true,
        referralCode: generateReferralCode(new Date().getTime().toString()),
      });
      await newUser.save();

      newUser.referralCode = generateReferralCode(newUser._id.toString());
      await newUser.save();

      const newWallet = new walletModel({
        userId: newUser._id,
        balance: 0,
        transaction: [],
      });
      await newWallet.save();

      if (referralCode && referralCode !== "NONE") {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          newUser.referredBy = referrer._id;
          referrer.successfulReferrals.push({ user: newUser._id });
          await newUser.save();
          await referrer.save();
          await handleReferralReward(referrer._id);
        }
      }

      req.session.userOtp = null;
      req.session.userData = null;

      req.flash("success_msg", "Registration successful");
      return res.redirect("/login");
    } else {
      req.flash("error_msg", "Invalid OTP. Please try again");
      return res.redirect("/otp");
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to verify OTP. Please try again.",
    });
  }
};





const loadLogin = async (req, res) => {
  try {
    return res.render("user/login");
  } catch (error) {
    console.log("Error while rendering Login page", error);
    res.status(500).send("Server error");
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg', "User not found !!!");
      return res.redirect("/login");
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      req.flash('error_msg', "Invalid password");
      return res.redirect("/login");
    }
    
    if (!user.status) {
      req.flash('error_msg', "Your account has been blocked. Please contact support");
      return res.redirect("/login");
    }
    
    req.session.userId = user._id.toString();  
    req.session.user = user.email;
    req.session.isAuth = true;
    
    req.flash('success_msg', "Logged in successfully");
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    req.flash('error_msg', "An error occurred during login");
    return res.redirect("/login");
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy();
    res.redirect('/login');
  } catch (error) {
    console.log("Error occurred while logging out", error);
    res.status(500).send("Server error");
  }
};

// Password Reset Flow
const loadForgot = async (req, res) => {
  try {
    return res.render("user/forgot");
  } catch (error) {
    console.log("Forgot password page not found", error);
    res.status(500).send("Server error");
  }
};

const forgot = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("user/forgot", {
        message: "User with this email does not exist.",
      });
    }
    
    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    
    if (!emailSent) {
      return res.render("user/forgot", {
        message: "Failed to send OTP. Please try again.",
      });
    }
    
    req.session.forgotPasswordOtp = otp;
    req.session.forgotPasswordEmail = email;
    
    req.flash('success_msg', "Email verified and OTP sent");
    return res.redirect("/forgot-otp");
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.render("user/forgot", {
      message: "An error occurred. Please try again.",
    });
  }
};

const loadForgototp = async (req, res) => {
  try {
    return res.render("user/forgot-otp");
  } catch (error) {
    console.log("Forgot password OTP page not found", error);
    res.status(500).send("Server error");
  }
};

const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { otp } = req.body;
 
    if (!req.session.forgotPasswordOtp || !req.session.forgotPasswordEmail) {
      return res.render("user/forgot-otp", {
        message: "Session expired. Please request a new OTP."
      });
    }
    
    if (otp === req.session.forgotPasswordOtp) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      req.session.resetToken = resetToken;
      req.session.forgotPasswordOtp = null;
      
      return res.redirect("/reset-password");
    } else {
      return res.render("user/forgot-otp", {
        message: "Invalid OTP. Please try again."
      });
    }
  } catch (error) {
    console.error("Verify forgot password OTP error:", error);
    return res.render("user/forgot-otp", {
      message: "Failed to verify OTP. Please try again."
    });
  }
};

const loadResetPassword = async (req, res) => {
  try {
    return res.render("user/reset-password");
  } catch (error) {
    console.log("Reset password page not found", error);
    res.status(500).send("Server error");
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    
    if (!req.session.resetToken || !req.session.forgotPasswordEmail) {
      return res.render("user/reset-password", {
        message: "Password reset session expired. Please try again."
      });
    }
    
    if (newPassword !== confirmPassword) {
      return res.render("user/reset-password", {
        message: "Passwords do not match."
      });
    }
    
    if (newPassword.length < 6) {
      return res.render("user/reset-password", {
        message: "Password must be at least 6 characters long."
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { email: req.session.forgotPasswordEmail },
      { $set: { password: hashedPassword } }
    );
    
    req.session.resetToken = null;
    req.session.forgotPasswordEmail = null;
    
    req.flash('success_msg', 'Password changed successfully');
    return res.redirect("/login");
  } catch (error) {
    console.error("Password reset error:", error);
    return res.render("user/reset-password", {
      message: "Failed to reset password. Please try again."
    });
  }
};

// Error Page
const pageNotFound = async (req, res) => {
  try {
    res.render("user/404");
  } catch (error) {
    console.error("Error rendering 404 page:", error);
    res.status(500).send("Server error");
  }
};




module.exports = {
  loadHomepage,
  pageNotFound,
  loadRegister,
  register,
  loadLogin,
  login,
  loadOtpPage,
  resendOtp,
  loadShop,
  shopByFilter,
  loadForgot,
  forgot,
  loadForgototp,
  loadResetPassword,
  verifyOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  logout,
};
