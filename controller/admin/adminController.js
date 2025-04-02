const adminModel = require("../../models/userSchema");
const Orders = require('../../models/orderSchema');
const Product = require('../../models/productSchema')
const bcrypt = require('bcrypt');

const loadDashboard = async (req, res) => {
    try {
        const currentDate = new Date();
        const filter = req.query.filter || 'monthly';

        let startDate;
        switch (filter) {
            case 'daily':
                startDate = new Date(currentDate.setHours(0, 0, 0, 0));
                break;
            case 'weekly':
                startDate = new Date(currentDate.setDate(currentDate.getDate() - 7));
                break;
            case 'monthly':
                startDate = new Date(currentDate.setMonth(currentDate.getMonth() - 1));
                break;
            case 'yearly':
                startDate = new Date(currentDate.setFullYear(currentDate.getFullYear() - 1));
                break;
        }

        const totalRevenue = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        const totalOrders = await Orders.countDocuments({ 
            createdAt: { $gte: startDate }, 
            orderStatus: 'Delivered' 
        });

        const totalProducts = await Product.countDocuments({ status: true });
        
        const monthlyEarning = await Orders.aggregate([
            { 
                $match: { 
                    createdAt: { 
                        $gte: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1) 
                    },
                    orderStatus: 'Delivered'
                } 
            },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        const salesData = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: filter === 'daily' ? '%Y-%m-%d' : 
                                  filter === 'weekly' ? '%Y-%U' : 
                                  filter === 'monthly' ? '%Y-%m' : '%Y',
                            date: '$createdAt'
                        }
                    },
                    total: { $sum: '$finalAmount' }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        // Top 10 Best Selling Products
        const bestSellingProducts = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $unwind: '$orderedItem' },
            {
                $group: {
                    _id: '$orderedItem.productId',
                    totalSold: { $sum: '$orderedItem.quantity' },
                    totalRevenue: { $sum: '$orderedItem.finalTotalProductPrice' }
                }
            },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        // Top 10 Best Selling Categories
        const bestSellingCategories = await Orders.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: 'Delivered' } },
            { $unwind: '$orderedItem' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'orderedItem.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.category',
                    totalSold: { $sum: '$orderedItem.quantity' },
                    totalRevenue: { $sum: '$orderedItem.finalTotalProductPrice' }
                }
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        // Latest Orders
        const latestOrders = await Orders.find({ 
            orderStatus: { $ne: 'Cancelled' }
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'userName')
        .populate('deliveryAddress');

        const salesReportUrl = '/admin/salesreport';

        res.render('admin/index', {
            revenue: totalRevenue[0]?.total || 0,
            orders: totalOrders,
            products: totalProducts,
            monthlyEarning: monthlyEarning[0]?.total || 0,
            salesData,
            bestSellingProducts,
            bestSellingCategories,
            latestOrders,
            filter,
            currentDate: new Date(),
            salesReportUrl
        });
    } catch (error) {
        console.error('Admin Dashboard Error:', error);
        res.status(500).send('Server error');
    }
};



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

        const val = !user.status

        await adminModel.updateOne({_id:id},{$set:{status: val}})

        res.redirect("/admin/users")

    } catch (error) {
        console.log("users blocking error", error);
        res.status(500).send("Internal Server Error");
    }
}


const blockUserAjax = async (req, res) => {
    try {
        const id = req.params.userId;
        
        const user = await adminModel.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        const newStatus = !user.status;
        
        await adminModel.updateOne({ _id: id }, { $set: { status: newStatus } });
        
        return res.status(200).json({ 
            success: true, 
            status: newStatus, 
            message: `User ${newStatus ? 'unblocked' : 'blocked'} successfully` 
        });
    } catch (error) {
        console.log("AJAX user blocking error", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    adminLogin,
    loadDashboard,
    adminLoginPost,
    adminLogout,
    usersPage,
    blockUser,
    blockUserAjax 
}