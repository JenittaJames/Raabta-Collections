const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const userModel = require("../../models/userSchema")
const ordersModel = require("../../models/orderSchema")
const addressModel = require("../../models/addressSchema")

const orders = async (req, res) => {
    try {
        const { query } = req.query;
        const searchQuery = query || "";
        
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        // Prepare the search filter
        let filter = {};
        
        if (searchQuery) {
            // We'll need to search in the related data
            // First, find user IDs that match the search query
            const matchingUsers = await require('mongoose').model('User').find({
                userName: { $regex: searchQuery, $options: 'i' }
            }).select('_id');
            
            const userIds = matchingUsers.map(user => user._id);
            
            filter = {
                $or: [
                    { orderNumber: { $regex: searchQuery, $options: 'i' } },
                    { orderStatus: { $regex: searchQuery, $options: 'i' } },
                    { paymentStatus: { $regex: searchQuery, $options: 'i' } },
                    { userId: { $in: userIds } }
                ]
            };
        }
        
        const totalOrders = await ordersModel.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limit);
        
        const ordersData = await ordersModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'userName');
        
        const order = ordersData.map(order => {
            // Check if any products have return requests
            const hasReturnRequest = order.orderedItem.some(item => 
                item.productStatus === 'Return Requested'
            );
            
            const hasReturnApproved = order.orderedItem.some(item => 
                item.productStatus === 'Return Approved'
            );
            
            const hasReturnRejected = order.orderedItem.some(item => 
                item.productStatus === 'Return Rejected'
            );
            
            return {
                id: order._id,
                orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
                userName: order.userId ? order.userId.userName : 'Unknown',
                orderDate: order.createdAt,
                totalAmount: order.orderAmount,
                status: order.orderStatus,
                paymentStatus: order.paymentStatus,
                hasReturnRequest,
                hasReturnApproved,
                hasReturnRejected
            };
        });
        
        res.render('admin/orders', {
            order,
            searchQuery,
            currentPage: page,
            totalPages
        });
        
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).render('error', { message: 'Error loading orders' });
    }
};

const orderDetails = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        const order = await ordersModel.findById(orderId)
            .populate({
                path: 'orderedItem.productId',
                model: 'Product'
            })
            .populate('userId');

        
        if (!order) {
            return res.status(404).render('error', { message: 'Order not found' });
        }
        
        // Get the delivery address from the order
        const address = order.deliveryAddress && order.deliveryAddress.length > 0 
            ? order.deliveryAddress[0] 
            : await addressModel.findOne({ userId: order.userId });

        
        res.render('admin/orderdetails', { order, address });
    } catch (error) {
        console.error('Error in admin orderDetails:', error);
        res.status(500).render('error', { message: 'Failed to load order details' });
    }
};

const verifyReturnRequest = async (req, res) => {
    try {
        const { orderId, productId, status } = req.body;
        
        const order = await ordersModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const orderItem = order.orderedItem.find(item => item._id.toString() === productId);
        if (!orderItem) {
            return res.status(404).json({ success: false, message: 'Product not found in this order' });
        }
        
        orderItem.productStatus = status;
        
        if (status === 'Return Approved') {

            if (orderItem.refunded) {
                return res.status(400).json({ success: false, message: 'This item has already been refunded' });
            }

            const user = await userModel.findById(order.userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            const refundAmount = orderItem.totalProductPrice;
            user.wallet += refundAmount;
            user.walletHistory.push({
                amount: refundAmount,
                type: 'credit',
                description: `Refund for return of order ${order.orderNumber}`,
                date: new Date()
            });

            orderItem.refunded = true;
            
            await user.save();
            
            const allItemsReturned = order.orderedItem.every(item => 
                item.productStatus === 'Return Approved' || item.productStatus === 'Cancelled'
            );
            
            if (allItemsReturned) {
                order.paymentStatus = 'Refunded';
            } else {
                // For partial refunds
                order.paymentStatus = 'partially-refunded';
            }
        }
        
        await order.save();
        
        return res.json({ 
            success: true, 
            message: `Return request ${status === 'Return Approved' ? 'approved and refund processed' : 'rejected'}`
        });
    } catch (error) {
        console.error('Error processing return verification:', error);
        return res.status(500).json({ success: false, message: 'Failed to process return verification' });
    }
};



const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, orderStatus, paymentStatus } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID is required' 
            });
        }

        const order = await ordersModel.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        if (orderStatus) {
            order.orderStatus = orderStatus;
        }


        if (paymentStatus) {
            order.paymentStatus = paymentStatus;
        }


        if (orderStatus === 'Delivered' && order.paymentMethod === 'COD') {
            order.paymentStatus = 'paid';
        }

        await order.save();

        return res.json({ 
            success: true, 
            message: 'Order status updated successfully',
            order: {
                id: order._id,
                orderStatus: order.orderStatus,
                paymentStatus: order.paymentStatus
            }
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status: ' + error.message 
        });
    }
};



const updateProductStatus = async (req, res) => {
    try {
        const { orderId, productId, productStatus } = req.body;

        if (!orderId || !productId || !productStatus) {
            return res.status(400).json({ 
                success: false, 
                message: 'Order ID, Product ID, and Product Status are required' 
            });
        }

        // Validate productStatus
        const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled", "Returned","Return Requested", "Return Approved", "Return Rejected"];
        if (!validStatuses.includes(productStatus)) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid product status. Valid values are: ${validStatuses.join(', ')}` 
            });
        }

        const order = await ordersModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        const product = order.orderedItem.find(item => item._id.toString() === productId);
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found in this order' 
            });
        }

        // Log the current and new status for debugging
        console.log("Current product status:", product.productStatus);
        console.log("Updating product status to:", productStatus);
        
        order.orderedItem.forEach(item => {
            // Convert all statuses to the correct case format
            if (item.productStatus === "pending") {
              item.productStatus = "Pending"; // Convert to proper case
            }
            // For the item being updated
            if (productStatus) {
              item.productStatus = productStatus;
            }
          });

        // Save the updated order
        await order.save();

        return res.json({ 
            success: true, 
            message: 'Product status updated successfully',
            product: {
                id: product._id,
                productStatus: product.productStatus
            }
        });
    } catch (error) {
        console.error('Error updating product status:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to update product status: ' + error.message 
        });
    }
};


module.exports = {
    orders,
    orderDetails,
    verifyReturnRequest,
    updateOrderStatus,
    updateProductStatus,
};