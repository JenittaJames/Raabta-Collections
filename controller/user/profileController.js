const userModel = require('../../models/userSchema')
const addressModel = require('../../models/addressSchema')

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
    const { firstName, phone, email } = req.body;
    const userId = req.session.userId;

    if (!firstName || !phone || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      {
        firstName : firstName,
        phone,
        email,
      },
      { new: true } 
    );

    console.log("puthiyathuuuuu",updatedUser);

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.redirect('/profile');
  } catch (error) {
    console.log("Error occurred while updating profile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


const createAddress = async (req,res) => {
    try {
        res.render('user/createaddress')
    } catch (error) {
        console.log("error occured while rendering address page",error);
    }
}


const addressPost =  async (req, res) => {
    const { name, email, mobile, houseName, street, city, state, country, pincode, saveAs, isDefault } = req.body;

    console.log("req.bodyeeeeeee",req.body);
  
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
          isDefault: isDefault === 'on'
        }]
      });
  
      await newAddress.save();
      res.redirect('/checkout');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  }


module.exports = {
    profile,
    createAddress,
    addressPost,
    updateProfile,
}