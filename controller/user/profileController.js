const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')
const ordersModel = require('../../models/orderSchema')
const cartModel = require('../../models/cartSchema')
const bcrypt = require("bcrypt");

const profile = async (req,res) => {
    try {
        const user = await userModel.findById(req.session.userId);
        res.render('user/profile',{user})
    } catch (error) {
        console.log("error occured");
    }
}


const updateProfile = async (req, res) => {
  try {
    const { userName, phone, email } = req.body;
    const userId = req.session.userId;

    if (!userName || !phone || !email) {
      return res.status(400).json({ status: 'error', message: "All fields are required" });
    }
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      {
        userName : userName,
        phone,
        email,
      },
      { new: true } 
    );

    if (!updatedUser) {
      return res.status(404).json({ status: 'error', message: "User not found" });
    }
    // res.redirect('/profile');

    res.status(200).json({status : 'success', message : "Profile updated successfully"})
  } catch (error) {
    console.log("Error occurred while updating profile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


const createAddress = async (req,res) => {
    try {
        res.render('user/createaddress',{title : 'Add New Address'})
    } catch (error) {
        console.log("error occured while rendering address page",error);
    }
}


const addressPost =  async (req, res) => {
    const { name, email, mobile, houseName, street, city, state, country, pincode, saveAs} = req.body;
    const isDefault = req.body.isDefault === 'on';
    const userId = req.session.userId;

    if (isDefault) {
      await addressModel.updateMany(
        { userId: userId },
        { "$set": { "address.$[].isDefault": false } }
      );
    }
  
    try {
      const newAddress = new addressModel({
        userId: req.session.userId,
        address: [{
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
          isDefault: isDefault
        }]
      });
  
      await newAddress.save();
      res.redirect('/address');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  };




  const setDefaultAddress = async (req, res) => {
    try {
      const addressId = req.params.id;
      const userId = req.session.userId;
      
      await addressModel.updateMany(
        { userId: userId },
        { "$set": { "address.$[].isDefault": false } }
      );
      
      await addressModel.findOneAndUpdate(
        { _id: addressId, userId: userId },
        { "$set": { "address.$[].isDefault": true } }
      );
      
      res.redirect('/address');
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred');
    }
  };




  const addressDetails = async (req, res) => {
    try {
      const addressDocuments = await addressModel.find({ userId: req.session.userId });
      
      const userAddresses = addressDocuments.map(doc => {
        if (doc.address && Array.isArray(doc.address) && doc.address.length > 0) {
          const addressData = doc.address[0];
          addressData._id = doc._id;
          return addressData;
        }
        return null;
      }).filter(Boolean); 
      
      console.log("Processed addresses:", userAddresses);
      res.render('user/address', { address: userAddresses });
    } catch (error) {
      console.error(error);
      res.status(500).send('An error occurred');
    }
  }



  const changePassword = async (req,res) => {
    try {
      res.render('user/changepassword',{ title: 'Change Password',user: req.user})
    } catch (error) {
      console.log("error occured while rendering the changepassword page",error);
    }
  }




  const changePasswordPost = async (req, res) => {
    try {
      const { current_password, new_password, confirm_password } = req.body;
      const userId = req.session.userId; 
      
      const user = await userModel.findById(userId);
      if (!user) {
        return res.json({
          success: false,
          message: 'User not found'
        });
      }
      
      const isMatch = await bcrypt.compare(current_password, user.password);
      if (!isMatch) {
        return res.json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
      if (new_password !== confirm_password) {
        return res.json({
          success: false,
          message: 'New passwords do not match'
        });
      }
      if (new_password.length < 8) {
        return res.json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(new_password, salt);
      
      user.password = hashedPassword;
      await user.save();
      
      return res.json({
        success: true,
        message: 'Password changed successfully'
      });
      
    } catch (error) {
      console.error('Error changing password:', error);
      return res.json({
        success: false,
        message: 'An error occurred while changing your password'
      });
    }
}

  

module.exports = {
    profile,
    createAddress,
    addressPost,
    updateProfile,
    addressDetails,
    setDefaultAddress,
    changePassword,
    changePasswordPost,
}