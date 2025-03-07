
const adminModel = require("../../models/userSchema");
const bcrypt = require('bcrypt');





const loadDashboard = async (req,res) =>{
    try {
        res.render("admin/index")
    } catch (error) {
        console.log("Admin Dashboard not found")
        res.status(500).send("Server error")
    }
}

const adminLogin = async (req,res) => {
    try {
        res.render("admin/login");
        
    } catch (error) {
        console.log("error occured while rendering",error);
    }
}

const adminLoginPost = async (req,res) => {
    try {
        const {email,password} = req.body;
        const admin = await adminModel.findOne({email:email,isAdmin:true})
        const isMatch = await bcrypt.compare(password,admin.password)

        if(!admin){
          return  res.redirect("/admin/login")
        }

        if(!isMatch){
           return res.redirect("/admin/login")
        }

        req.session.isAdmin = true;
        res.redirect("/admin/dashboard")


    } catch (error) {
        console.log("Server error");

    }
}

const adminLogout = async (req,res) => {
    try {
        req.session.destroy();
        res.redirect("/admin")
        console.log("logout successfully");
    } catch (error) {
        console.log("admin logout error",error);
    }
}




const usersPage = async (req, res) => {
    try {
        const { query } = req.query;
        const searchQuery = query || "";
        
        const searchFilter = { isAdmin: false };
        
        if (searchQuery) {
            searchFilter.$or = [
                { userName: { $regex: searchQuery, $options: "i" } },
                { email: { $regex: searchQuery, $options: "i" } },
                { phone: { $regex: searchQuery, $options: "i" } }
            ];
        }
        
        const page = parseInt(req.query.page) || 1; 
        const limit = 8; 
        const skip = (page - 1) * limit; 

        const totalUsers = await adminModel.countDocuments(searchFilter); 
        const totalPages = Math.ceil(totalUsers / limit); 

        const userList = await adminModel.find(searchFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("admin/users", {
            users: userList,
            searchQuery,
            currentPage: page,
            totalPages: totalPages
        });

    } catch (error) {
        console.log("users page error", error);
        res.status(500).send("Internal Server Error");
    }
};





const blockUser = async (req,res) => {
    try {
        const id = req.params.userId;

        const user = await adminModel.findById(id)
        console.log(user);

        const val = !user.status

        await adminModel.updateOne({_id:id},{$set:{status: val}})

        res.redirect("/admin/users")

    } catch (error) {
        console.log("users blocking error", error);
        res.status(500).send("Internal Server Error");
    }
}








module.exports = {
    adminLogin,
    loadDashboard,
    adminLoginPost,
    adminLogout,
    usersPage,
    blockUser,
}