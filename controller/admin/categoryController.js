const catModel = require("../../models/categorySchema")

const categoriesPage = async (req, res) => {
    try {
        const { query } = req.query;
        const searchQuery = query || "";
        
        const searchFilter = {};
        
        if (searchQuery) {
            searchFilter.$or = [
                { name: { $regex: searchQuery, $options: "i" } },
                { description: { $regex: searchQuery, $options: "i" } }
            ];
        }
        
        const page = parseInt(req.query.page) || 1; 
        const limit = 4; 
        const skip = (page - 1) * limit; 

        const totalCategory = await catModel.countDocuments(searchFilter); 
        const totalPages = Math.ceil(totalCategory / limit); 

        const categories = await catModel.find(searchFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("admin/categories", {
            categories,
            searchQuery,
            currentPage: page,
            totalPages: totalPages
        });

    } catch (error) {
        console.log("categories page error", error);
        res.status(500).send("Internal Server Error");
    }
}


const addCategory = async (req,res) => {
    try {
        res.render("admin/addcategory")
    } catch (error) {
        console.log("Add category error");
    }
}


const addCategoryPost = async (req,res) => {
    try {
        const {name,description} = req.body

        const categoryExisting = await catModel.findOne({ 
            name: { $regex: new RegExp("^" + name + "$", "i") } 
        });

        if(categoryExisting){
            res.redirect("/admin/categories")
        }else{
            await catModel.create({ name: name, description: description});
            res.redirect("/admin/categories")
        }
    } catch (error) {
        console.log("category page error", error);
        res.status(500).send("Internal Server Error");
    }
}

// Original function - keeps the redirect for non-AJAX calls
const blockCategory = async (req,res) => {
    try {
        const id = req.params.categoryId;

        const category = await catModel.findById(id)
        const val = !category.status

        await catModel.updateOne({_id:id},{$set:{status: val}})

        res.redirect("/admin/categories")

    } catch (error) {
        console.log("category blocking error", error);
        res.status(500).send("Internal Server Error");
    }
}

// New API endpoint for AJAX requests
const blockCategoryApi = async (req, res) => {
    try {
        const id = req.params.categoryId;
        
        // Find the category
        const category = await catModel.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }
        
        // Toggle the status
        const newStatus = !category.status;
        
        // Update in database
        await catModel.updateOne({ _id: id }, { $set: { status: newStatus } });
        
        // Return the updated status
        return res.status(200).json({
            success: true,
            status: newStatus,
            message: `Category ${newStatus ? 'activated' : 'deactivated'} successfully`
        });
        
    } catch (error) {
        console.log("API category blocking error", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
}

const editCategory = async (req,res) => {
    try {
        const categoryId = req.params.categoryId;
        const category = await catModel.findOne({_id:categoryId})
        res.render("admin/editcategory",{category})
    } catch (error) {
        console.log("edit category error", error);
        res.status(500).send("Internal Server Error");
    }
}



const editCategoryPost = async (req, res) => {
    try {
        const { name, description } = req.body;
        const categoryId = req.params.id || req.body.id;


        if (!categoryId) {
            return res.status(400).send("Invalid Request: Category ID is missing");
        }

        const categoryExisting = await catModel.findById(categoryId);

        if (!categoryExisting) {
            return res.status(404).send("Category not found");
        }

        await catModel.updateOne(
            { _id: categoryId },
            { name: name, description: description }
        );

        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Category page error:", error);
        res.status(500).send("Internal Server Error");
    }
};

module.exports = {
    categoriesPage,
    addCategory,
    addCategoryPost,
    blockCategory,
    blockCategoryApi, // New API endpoint export
    editCategory,
    editCategoryPost,
}