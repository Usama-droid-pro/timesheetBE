const express = require('express');
const router = express.Router();
const {processAttendance} = require('../services/attendance-automation');


router.get("/attendence/trigger" , processAttendance )

module.exports = router;






