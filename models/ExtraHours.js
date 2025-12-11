const mongoose = require('mongoose');

const extraHoursSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        required: true,
    },
    startTime: {
        type: String,
        required: true,
    },
    endTime: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: false,
    },
    hours: {
        type: Number,
        required: true,
    },
    approvalStatus: {
        type: String,
        default: "Pending",
        enum: ["Pending", "NA", "Approved", "SinglePay", "Rejected"],
    },
    note: {
        type: String,
        required: false,
    },

}, { timestamps: true });

const ExtraHours = mongoose.model('ExtraHours', extraHoursSchema);

module.exports = ExtraHours;