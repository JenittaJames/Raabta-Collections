const userModel = require("../../models/userSchema");
const addressModel = require("../../models/addressSchema");
const ordersModel = require("../../models/orderSchema");
const cartModel = require("../../models/cartSchema");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

// Generate OTP function
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
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
      subject: "Verify your email update",
      text: `Your OTP to verify your email change is ${otp}`,
      html: `<b>Your email verification OTP: ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    throw new Error("Failed to send verification email");
  }
}

const profile = async (req, res) => {
  try {
    const user = await userModel.findById(req.session.userId);
    res.render("user/profile", { user });
  } catch (error) {
    console.log("error occured");
  }
};

const updateProfile = async (req, res) => {
  try {
    const { userName, phone, email } = req.body;
    const userId = req.session.userId;

    if (!userName || !phone || !email) {
      return res
        .status(400)
        .json({ status: "error", message: "All fields are required" });
    }

    // Get current user data
    const currentUser = await userModel.findById(userId);

    // If email hasn't changed, update profile directly
    if (currentUser.email === email) {
      const updatedUser = await userModel.findByIdAndUpdate(
        userId,
        {
          userName: userName,
          phone: phone,
        },
        { new: true }
      );

      if (!updatedUser) {
        return res
          .status(404)
          .json({ status: "error", message: "User not found" });
      }

      return res
        .status(200)
        .json({ status: "success", message: "Profile updated successfully" });
    }

    // If email has changed, send OTP for verification
    else {
      // Check if email already exists with another user
      const emailExists = await userModel.findOne({
        email: email,
        _id: { $ne: userId },
      });
      if (emailExists) {
        return res
          .status(400)
          .json({
            status: "error",
            message: "Email already in use by another account",
          });
      }

      // Generate OTP
      const otp = generateOtp();

      console.log("otp ividaanoooo", otp);

      // Store update data and OTP in session
      req.session.profileUpdate = {
        userId,
        userName,
        phone,
        newEmail: email,
        otp,
        timestamp: Date.now(), // For OTP expiration
      };

      // Send verification email
      const emailSent = await sendVerificationEmail(email, otp);
      if (!emailSent) {
        return res
          .status(500)
          .json({
            status: "error",
            message: "Failed to send verification email",
          });
      }

      return res.status(200).json({
        status: "verify",
        message:
          "Please verify your new email address. An OTP has been sent to your new email.",
      });
    }
  } catch (error) {
    console.log("Error occurred while updating profile:", error);
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};

// Render email verification page
const verifyEmailUpdate = async (req, res) => {
  try {
    if (!req.session.profileUpdate) {
      return res.redirect("/profile");
    }

    res.render("user/emailverification", {
      email: req.session.profileUpdate.newEmail,
    });
  } catch (error) {
    console.log("Error rendering email verification page:", error);
    res.status(500).send("Server error");
  }
};

// Verify email OTP and complete profile update
const verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!req.session.profileUpdate) {
      return res.status(400).json({
        status: "error",
        message:
          "Verification session expired. Please try updating your profile again.",
      });
    }

    // Check OTP expiration (30 minutes)
    const otpAge = Date.now() - req.session.profileUpdate.timestamp;

    if (otpAge > 30 * 60 * 1000) {
      delete req.session.profileUpdate;
      return res.status(400).json({
        status: "error",
        message: "OTP has expired. Please try again.",
      });
    }

    // Verify OTP
    if (otp === req.session.profileUpdate.otp) {
      // Update user profile
      const { userId, userName, phone, newEmail } = req.session.profileUpdate;

      const updatedUser = await userModel.findByIdAndUpdate(
        userId,
        {
          userName,
          phone,
          email: newEmail,
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({
          status: "error",
          message: "User not found",
        });
      }

      // Clear session data
      delete req.session.profileUpdate;

      return res.status(200).json({
        status: "success",
        message: "Email verified and profile updated successfully",
      });
    } else {
      return res.status(400).json({
        status: "error",
        message: "Invalid OTP. Please try again.",
      });
    }
  } catch (error) {
    console.log("Error verifying email OTP:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

// Resend OTP for email verification
const resendEmailOtp = async (req, res) => {
  try {
    if (!req.session.profileUpdate) {
      return res.status(400).json({
        status: "error",
        message:
          "Verification session expired. Please try updating your profile again.",
      });
    }

    // Generate new OTP
    const newOtp = generateOtp();
    const email = req.session.profileUpdate.newEmail;

    // Update session with new OTP and timestamp
    req.session.profileUpdate.otp = newOtp;
    req.session.profileUpdate.timestamp = Date.now();

    // Send verification email
    const emailSent = await sendVerificationEmail(email, newOtp);
    if (!emailSent) {
      return res.status(500).json({
        status: "error",
        message: "Failed to send verification email",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.log("Error resending email OTP:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

const createAddress = async (req, res) => {
  try {
    res.render("user/createaddress", { title: "Add New Address" });
  } catch (error) {
    console.log("error occured while rendering address page", error);
  }
};

const addressPost = async (req, res) => {
  const {
    name,
    email,
    mobile,
    houseName,
    street,
    city,
    state,
    country,
    pincode,
    saveAs,
  } = req.body;
  const isDefault = req.body.isDefault === "on";
  const userId = req.session.userId;

  if (isDefault) {
    await addressModel.updateMany(
      { userId: userId },
      { $set: { "address.$[].isDefault": false } }
    );
  }

  try {
    const newAddress = new addressModel({
      userId: req.session.userId,
      address: [
        {
          name,
          email,
          mobile,
          houseName,
          street,
          city,
          state,
          country,
          pincode,
          saveAs,
          isDefault: isDefault,
        },
      ],
    });

    await newAddress.save();
    res.redirect("/address");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userId;

    await addressModel.updateMany(
      { userId: userId },
      { $set: { "address.$[].isDefault": false } }
    );

    await addressModel.findOneAndUpdate(
      { _id: addressId, userId: userId },
      { $set: { "address.$[].isDefault": true } }
    );

    res.redirect("/address");
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred");
  }
};

const addressDetails = async (req, res) => {
  try {
    const addressDocuments = await addressModel.find({
      userId: req.session.userId,
    });

    const userAddresses = addressDocuments
      .map((doc) => {
        if (
          doc.address &&
          Array.isArray(doc.address) &&
          doc.address.length > 0
        ) {
          const addressData = doc.address[0];
          addressData._id = doc._id;
          return addressData;
        }
        return null;
      })
      .filter(Boolean);

    res.render("user/address", { address: userAddresses });
  } catch (error) {
    console.error(error);
    res.status(500).send("An error occurred");
  }
};

const changePassword = async (req, res) => {
  try {
    res.render("user/changepassword", {
      title: "Change Password",
      user: req.user,
    });
  } catch (error) {
    console.log("error occured while rendering the changepassword page", error);
  }
};

const changePasswordPost = async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;
    const userId = req.session.userId;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(current_password, user.password);
    if (!isMatch) {
      return res.json({
        success: false,
        message: "Current password is incorrect",
      });
    }
    if (new_password !== confirm_password) {
      return res.json({
        success: false,
        message: "New passwords do not match",
      });
    }
    if (new_password.length < 8) {
      return res.json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    user.password = hashedPassword;
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.json({
      success: false,
      message: "An error occurred while changing your password",
    });
  }
};

const walletHistory = async (req, res) => {
  try {
    const user = await userModel.findById(req.session.userId);
    if (!user) {
      return res.status(404).render("error", { message: "User not found" });
    }

    const sortedWalletHistory = user.walletHistory.sort((a, b) => b.date - a.date);

    res.render("user/walletHistory", { walletHistory: sortedWalletHistory });
  } catch (error) {
    console.error("Error fetching wallet history:", error);
    res
      .status(500)
      .render("error", { message: "Failed to load wallet history" });
  }
};

const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, returnReason } = req.body;

    if (!returnReason || returnReason.trim() === '') {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is required" });
    }

    const order = await ordersModel.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const orderItem = order.orderedItem.find(
      (item) => item._id.toString() === productId
    );
    if (!orderItem) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found in this order" });
    }

    if (orderItem.productStatus !== "Delivered") {
      return res
        .status(400)
        .json({ success: false, message: "Product is not delivered" });
    }

    orderItem.productStatus = "Return Requested";
    orderItem.returnReason = returnReason;
    orderItem.returnRequestDate = new Date();
    
    await order.save();

    return res.json({
      success: true,
      message: "Return request submitted successfully",
    });
  } catch (error) {
    console.error("Error processing return request:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to process return request" });
  }
};

const editAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userId;
    
    // Find the address document
    const addressDoc = await addressModel.findOne({
      _id: addressId,
      userId: userId
    });
    
    if (!addressDoc || !addressDoc.address || addressDoc.address.length === 0) {
      return res.status(404).render("error", { message: "Address not found" });
    }
    
    // Get the address data
    const addressData = addressDoc.address[0];
    
    res.render("user/editaddress", { 
      title: "Edit Address", 
      address: addressData,
      addressId: addressId
    });
  } catch (error) {
    console.error("Error loading address for editing:", error);
    res.status(500).render("error", { message: "Failed to load address data" });
  }
};

const updateAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userId;
    
    const {
      name,
      email,
      mobile,
      houseName,
      street,
      city,
      state,
      country,
      pincode,
      saveAs
    } = req.body;
    
    // Check if this address should be set as default
    const isDefault = req.body.isDefault === "on";
    
    // If this address is being set as default, unset all other addresses as default
    if (isDefault) {
      await addressModel.updateMany(
        { userId: userId },
        { $set: { "address.$[].isDefault": false } }
      );
    }
    
    // Update the address document
    const updatedAddress = await addressModel.findOneAndUpdate(
      { _id: addressId, userId: userId },
      { 
        $set: { 
          "address.0.name": name,
          "address.0.email": email,
          "address.0.mobile": mobile,
          "address.0.houseName": houseName,
          "address.0.street": street,
          "address.0.city": city,
          "address.0.state": state,
          "address.0.country": country,
          "address.0.pincode": pincode,
          "address.0.saveAs": saveAs,
          "address.0.isDefault": isDefault
        } 
      },
      { new: true }
    );
    
    if (!updatedAddress) {
      return res.status(404).render("error", { message: "Address not found or could not be updated" });
    }
    
    res.redirect("/address");
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).render("error", { message: "Failed to update address" });
  }
};



const deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.session.userId;
    
    const deletedAddress = await addressModel.findOneAndDelete({
      _id: addressId,
      userId: userId
    });
    
    if (!deletedAddress) {
      return res.status(404).render("error", { message: "Address not found or could not be deleted" });
    }
    
    req.session.successMessage = "Address deleted successfully";
    
    res.redirect("/address");
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).render("error", { message: "Failed to delete address" });
  }
};


module.exports = {
  profile,
  createAddress,
  addressPost,
  updateProfile,
  verifyEmailUpdate,
  verifyEmailOtp,
  resendEmailOtp,
  addressDetails,
  setDefaultAddress,
  changePassword,
  changePasswordPost,
  walletHistory,
  requestReturn,
  editAddress,
  updateAddress,
  deleteAddress,
};
