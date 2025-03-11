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
        
        let filter = {};
        
        if (searchQuery) {
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
                order.paymentStatus = 'partially-refunded';
            }
            
            // Update inventory - add returned items back to stock
            try {
                for (const item of order.orderedItem) {
                    if (item.productStatus === 'Return Approved') {
                        const product = await productModel.findById(item.productId);
                        if (product) {
                            product.totalStock += item.quantity;
                            await product.save();
                        }
                    }
                }
            } catch (stockError) {
                console.error('Error updating product stock:', stockError);
                // Continue processing even if stock update fails
            }
        }
        
        // Record the return handling timestamp
        orderItem.updatedAt = new Date();
        
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

       product.productStatus = productStatus;

       // Optional: Update overall order status based on product statuses
const allProductStatuses = order.orderedItem.map(item => item.productStatus);

// If all products are in the same status, update order status accordingly
if (allProductStatuses.every(status => status === 'Delivered')) {
    order.orderStatus = 'Delivered';
} else if (allProductStatuses.every(status => status === 'Cancelled')) {
    order.orderStatus = 'Cancelled';
} else if (allProductStatuses.some(status => status === 'Returned')) {
    // If any product is returned but not all
    order.orderStatus = 'Returned';
} else if (allProductStatuses.every(status => status === 'Shipped')) {
    order.orderStatus = 'Shipped';
} else if (allProductStatuses.some(status => status === 'Shipped') && 
           allProductStatuses.every(status => status === 'Shipped' || status === 'Delivered')) {
    // Some shipped, some delivered
    order.orderStatus = 'Delivered';
} else {
    // Mixed statuses
    order.orderStatus = 'Pending';
}

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



const submitReturnRequest = async (req, res) => {
    try {
        const { orderId, productId, reason } = req.body;
        
        const order = await ordersModel.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check if user is authorized to request this return
        if (order.userId.toString() !== req.session.userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        const orderItem = order.orderedItem.find(item => item._id.toString() === productId);
        if (!orderItem) {
            return res.status(404).json({ success: false, message: 'Product not found in this order' });
        }
        
        // Check if product is eligible for return
        if (orderItem.productStatus !== 'Delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered items can be returned' });
        }
        
        const deliveryDate = new Date(orderItem.deliveredAt || order.updatedAt);
        const currentDate = new Date();
        const daysSinceDelivery = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceDelivery > 7) {
            return res.status(400).json({ success: false, message: 'Return window has expired (7 days)' });
        }
        
        // Update item status and store return reason
        orderItem.productStatus = 'Return Requested';
        orderItem.returnReason = reason;
        orderItem.updatedAt = new Date();
        
        await order.save();
        
        return res.json({
            success: true,
            message: 'Return request submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting return request:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
};


module.exports = {
    orders,
    orderDetails,
    verifyReturnRequest,
    updateOrderStatus,
    updateProductStatus,
    submitReturnRequest,
};