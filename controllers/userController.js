const mongoose = require('mongoose');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const asyncHandler = require('../middlewares/asyncHandler');
const bcrypt = require('bcryptjs');

// @desc    Get all users for the admin's tenant with their real-time status
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;

    // Use aggregation to join user data with their latest session data
    const usersWithSessionData = await User.aggregate([
        {
            $match: { tenantId: new mongoose.Types.ObjectId(tenantId) }
        },
        {
            $lookup: {
                from: 'usersessions',
                let: { userId: '$_id' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
                    { $sort: { loginTime: -1 } },
                    { $limit: 1 }
                ],
                as: 'latestSession'
            }
        },
        {
            $unwind: {
                path: '$latestSession',
                preserveNullAndEmptyArrays: true // Keep users even if they have no sessions
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                email: 1,
                role: 1,
                isActive: 1,
                isOnline: 1, // The real-time field from the User model
                lastSeen: 1, // The real-time field from the User model
                // Fields from the latest session
                firstLogin: '$latestSession.loginTime',
                lastActionAt: '$latestSession.lastActionAt',
                // Determine status based on isOnline and isIdle
                status: {
                    $cond: {
                        if: '$isOnline',
                        then: {
                            $cond: { if: '$latestSession.isIdle', then: 'idle', else: 'online' }
                        },
                        else: 'offline'
                    }
                }
            }
        }
    ]);
    
    res.json(usersWithSessionData);
});


// @desc    Get login/logout history for a specific user (longer than 5 mins)
// @route   GET /api/users/:id/sessions
// @access  Private/Admin
exports.getUserSessions = asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const tenantId = req.user.tenantId;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser || targetUser.tenantId.toString() !== tenantId.toString()) {
        res.status(404);
        throw new Error('User not found in your company.');
    }

    // ✅ ---  بداية التعديل --- ✅
    // Find sessions that belong to the user AND have a duration of 300 seconds (5 minutes) or more.
    const sessions = await UserSession.find({ 
        userId: targetUserId,
        duration: { $gte: 300 } // This condition filters for sessions >= 5 minutes
    })
        .sort({ loginTime: -1 })
        .limit(20)
        .lean();
    // ✅ ---  نهاية التعديل --- ✅
        
    res.status(200).json({ ok: true, sessions: sessions });
});


// @desc    Update a sales user by Admin
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const { name, email, password, isActive } = req.body;

    const targetUser = await User.findOne({ _id: targetUserId, tenantId: req.user.tenantId });

    if (!targetUser) {
        res.status(404);
        throw new Error('User not found');
    }
    
    // Admins can only edit 'sales' users
    if (targetUser.role !== 'sales') {
        res.status(403);
        throw new Error('Forbidden: You can only edit users with the "sales" role.');
    }

    // Update fields
    targetUser.name = name ?? targetUser.name;
    targetUser.email = email ?? targetUser.email;
    
    const isBeingDeactivated = isActive === false && targetUser.isActive === true;
    targetUser.isActive = isActive ?? targetUser.isActive;


    if (password) {
        targetUser.password = password; // pre-save hook will hash it
    }
    
    //...
// If the user is being deactivated, force them to log out
if (isBeingDeactivated) {
    const io = req.io; // ✅ <---  التصحيح الأول: استدعاء الـ socket من الـ request مباشرة
    if (io) { // ✅ <--- التصحيح الثاني: التأكد من وجود الـ socket قبل استخدامه
            io.to(`user:${targetUserId.toString()}`).emit('force_logout', { 
            message: 'Your account has been deactivated by an administrator.' 
        });
    }
}
//...

    const updatedUser = await targetUser.save();

    res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
    });
});


// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.user.tenantId });

    if (user) {
        res.json(user);
    } else {
        res.status(404);
        throw new Error('User not found in your company');
    }
});


// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.user.tenantId });

    if (user) {
        if (user.role === 'admin' || user.id === req.user.id) {
            res.status(403);
            throw new Error('Action forbidden.');
        }
        await user.deleteOne();
        res.json({ message: 'User removed' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});