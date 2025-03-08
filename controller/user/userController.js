const User = require("../../models/userSchema");
const dotenv = require("dotenv");
dotenv.config();
const bcrypt = require("bcrypt");
const crypto = require('crypto');
const nodemailer = require("nodemailer");
const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");

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



const loadHomepage = async (req, res) => {
  try {
    const categories = await catModel.find({});
    const products = await productModel.find({status: true}); 
    res.render("user/home", { categories, products });
  } catch (error) {
    console.error("Error while loading homepage:", error);
    res.status(500).send("Internal Server Error");
  }
};



const loadRegister = async (req, res) => {
  try {
    return res.render("user/register");
  } catch (error) {
    console.log("Error while rendering Register page",error);
    res.status(500).send("Server error");
  }
};

const register = async (req, res) => {
  try {
    const { userName, email, phone, password, confirmPassword } =
      req.body;
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
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      userName,
      email,
      phone,
      password: hashedPassword,
    });
    await newUser.save();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res
        .status(500)
        .json({ error: "Failed to send verification email" });
    }
    req.session.userOtp = otp;
    req.session.email = newUser.email;
    req.session.userId = newUser._id;
    console.log("OTP Sent", otp);
    return res.redirect("/otp");
  } catch (error) {
    console.error("Error occured while Registration", error);
    return res.redirect("/pageNotFound");
  }
};



const loadLogin = async (req, res) => {
  try {
    return res.render("user/login");
  } catch (error) {
    console.log("Error while rendering Login page",error);
    res.status(500).send("Server error");
  }
};



const login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error_msg',"User not found !!!")
      return res.redirect("/login")

    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      req.flash('error_msg',"Invalid password")
      return res.redirect("/login")
    }
    if(!user.status){
      req.flash('error_msg',"Your account has been blocked. Please contact support")
      return res.redirect("/login")
    }
    req.session.userId = user._id.toString();  
    req.session.user = user.email;
    req.session.isAuth = true;
    req.flash('success_msg',"Logged in successfully")
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
  }
};



const loadOtpPage = async (req, res) => {
  try {
    res.render("user/otp", { type: "register" });
  } catch (error) {
    console.log("OTP page not found.....",error);
    res.status(500).send("Server error");
  }
};



const resendOtp = async (req, res) => {
  try {
    if (!req.session.userData || !req.session.userData.email) {
      return res.status(400).json({
        status: "error",
        message: "Session expired. Please try again.",
      });
    }

    const email = req.session.userData.email;
    const newOtp = generateOtp();

    const emailSent = await sendVerificationEmail(email, newOtp);

    if (emailSent) {
      req.session.userOtp = newOtp;
      console.log(`OTP resent successfully: ${newOtp}`);
      return res.json({
        status: "success",
        message: "OTP resent successfully",
      });
    } else {
      return res.status(500).json({
        status: "error",
        message: "Failed to send verification email",
      });
    }
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to resend OTP",
    });
  }
};




const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!req.session.userOtp || !req.session.email) {
      return res.status(400).json({
        status: "error",
        message: "Session expired. Please request a new OTP.",
      });
    }
    if (otp === req.session.userOtp) {
      await User.updateOne(
        { email: req.session.email },
        { $set: { isVerified: true } }
      );
      req.session.userOtp = null;
      req.session.userId = null;
      req.session.email = null;
      req.flash('success_msg', 'Register successfully');
      return res.redirect("/login");
    } else {
      return res.status(400).send({
        status: "error",
        message: "Invalid OTP. Please try again.",
      });
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to verify OTP. Please try again.",
    });
  }
};



const loadForgot = async (req, res) => {
  try {
    return res.render("user/forgot");
  } catch (error) {
    console.log("Forgot password page not found",error);
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
    req.flash('success_msg',"Email verified and OTP sent")
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
    console.log("Forgot password OTP page not found");
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
      const resetEmail = req.session.forgotPasswordEmail;
      req.session.forgotPasswordOtp = null;
      const resetToken = crypto.randomBytes(32).toString('hex');
      req.session.resetToken = resetToken;
      return res.redirect("/reset-password");
    } else {
      return res.render("user/forgot-otp", {
        message: "Invalid OTP. Please try again."
      });
    }
  } catch (error) {
    return res.render("user/forgot-otp", {
      message: "Failed to verify OTP. Please try again."
    });
  }
};



const loadResetPassword = async (req, res) => {
  try {
    return res.render("user/reset-password");
  } catch (error) {
    console.log("reset password page not found");
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

   const user= await User.updateOne(
      { email: req.session.forgotPasswordEmail },
      { $set: { password: hashedPassword } }
    );
    req.session.resetToken = null;
    req.session.forgotPasswordEmail = null;
    req.flash('success_msg','Password changed successfully')
    return res.redirect("/login");
  } catch (error) {
    console.error("Password reset error:", error);
    return res.render("user/reset-password", {
      message: "Failed to reset password. Please try again."
    });
  }
};


const pageNotFound = async (req, res) => {
  try {
    res.render("user/404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};




const loadShop = async (req, res) => {
  try {

    const {query}=req.query;

    const searchQuery = query || "";

    const searchFilter = {
      status: true,
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
    
    const totalProducts = await productModel.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalProducts / limit);
    
    const products = await productModel.find(searchFilter)
      .skip(skip)
      .limit(limit);
    
    const categories = await catModel.find({});
    
    res.render("user/shop", { 
      products,
      searchQuery : searchQuery, 
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      limit
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
    
    const totalProducts = await productModel.countDocuments({ category: categoryId });
    const totalPages = Math.ceil(totalProducts / limit);
    
    const products = await productModel.find({ category: categoryId })
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
    console.log("error occurred while rendering shop by filter page", error);
    res.status(500).send("Internal Server Error");
  }
};


const logout = async (req,res) => {
  try {
    req.session.destroy()
    res.redirect('/login')
  } catch (error) {
    console.log("error occure while logging out");
  }
}









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
