
const adminAuth = async (req,res,next) => {
    try {
        if(req.session.isAdmin){
            next()
        }else{
            res.redirect("/admin")
        }
    } catch (error) {
        
    }
}


module.exports = {
    adminAuth
}