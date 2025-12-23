const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

router.post('/', teamController.createTeam);
router.put('/:id', teamController.updateTeam);
router.get('/', teamController.getAllTeams);
router.get('/:id', teamController.getTeamById);
router.get('/myteams/me', teamController.getMyTeams);

module.exports = router;