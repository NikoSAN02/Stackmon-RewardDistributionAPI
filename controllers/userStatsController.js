const supabase = require('../utils/supabase');
const Joi = require('joi');
const logger = require('../utils/logger');

// Validation schema for recording user data
const recordUserDataSchema = Joi.object({
    walletAddress: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
        'string.pattern.base': 'Invalid Solana address format'
    }),
    depositAmount: Joi.number().required().min(0),
    roomId: Joi.string().required()
});

// Validation schema for updating user data (legacy)
const updateUserDataSchema = Joi.object({
    walletAddress: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
        'string.pattern.base': 'Invalid Solana address format'
    }),
    roomId: Joi.string().required(),
    transactionHash: Joi.string().allow(null, ''),
    rewards: Joi.number().min(0),
    kills: Joi.number().integer().min(0)
}).min(3);

// Validation schema for UpdateGameStats
const updateGameStatsSchema = Joi.object({
    walletAddress: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
        'string.pattern.base': 'Invalid Solana address format'
    }),
    depositAmount: Joi.number().required().min(0),
    roomId: Joi.string().required(),
    rewards: Joi.number().min(0),
    kills: Joi.number().integer().min(0)
}).min(4); // At least the 3 keys + 1 update field

class UserStatsController {

    /**
     * Record initial user data
     */
    async recordUserData(req, res) {
        try {
            logger.info('Recording user stats', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                body: req.body
            });

            // Validate request body
            const { error, value } = recordUserDataSchema.validate(req.body);
            if (error) {
                logger.warn('Validation failed for recording user stats', {
                    error: error.details[0].message,
                    body: req.body
                });

                return res.status(400).json({
                    error: 'Validation Error',
                    message: error.details[0].message
                });
            }

            const { walletAddress, depositAmount, roomId } = value;

            // Insert data into Supabase
            const { data, error: supabaseError } = await supabase
                .from('KillersArena_GameStats')
                .insert([
                    {
                        wallet_address: walletAddress,
                        deposit_amount: depositAmount,
                        room_id: roomId
                    }
                ])
                .select();

            if (supabaseError) {
                throw new Error(`Supabase error: ${supabaseError.message}`);
            }

            const insertedRecord = data[0];

            res.status(201).json({
                success: true,
                message: 'User data recorded successfully',
                data: insertedRecord
            });

            logger.info('User stats recorded successfully', {
                id: insertedRecord.id,
                walletAddress: walletAddress
            });

        } catch (error) {
            logger.error('Error recording user stats', {
                error: error.message,
                body: req.body,
                ip: req.ip
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    /**
     * Update existing user data (Legacy - Key: Wallet + Room)
     */
    async updateUserData(req, res) {
        try {
            logger.info('Updating user stats (Legacy)', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                body: req.body
            });

            // Validate request body
            const { error, value } = updateUserDataSchema.validate(req.body);
            if (error) {
                logger.warn('Validation failed for updating user stats', {
                    error: error.details[0].message,
                    body: req.body
                });

                return res.status(400).json({
                    error: 'Validation Error',
                    message: error.details[0].message
                });
            }

            const { walletAddress, roomId, transactionHash, rewards, kills } = value;

            // Prepare update object
            const updates = {};
            if (transactionHash !== undefined) updates.transaction_hash = transactionHash;
            if (rewards !== undefined) updates.rewards = rewards;
            if (kills !== undefined) updates.kills = kills;

            // Update data in Supabase
            const { data, error: supabaseError } = await supabase
                .from('KillersArena_GameStats')
                .update(updates)
                .eq('wallet_address', walletAddress)
                .eq('room_id', roomId)
                .select();

            if (supabaseError) {
                throw new Error(`Supabase error: ${supabaseError.message}`);
            }

            if (!data || data.length === 0) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'No record found matching the wallet address and room ID'
                });
            }

            const updatedRecord = data[0];

            res.status(200).json({
                success: true,
                message: 'User data updated successfully',
                data: updatedRecord
            });

            logger.info('User stats updated successfully', {
                id: updatedRecord.id,
                walletAddress: walletAddress
            });

        } catch (error) {
            logger.error('Error updating user stats', {
                error: error.message,
                body: req.body,
                ip: req.ip
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }

    /**
     * Update Game Stats (Key: Wallet + Deposit + Room)
     */
    async updateGameStats(req, res) {
        try {
            logger.info('Updating game stats', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                body: req.body
            });

            // Validate request body
            const { error, value } = updateGameStatsSchema.validate(req.body);
            if (error) {
                logger.warn('Validation failed for UpdateGameStats', {
                    error: error.details[0].message,
                    body: req.body
                });

                return res.status(400).json({
                    error: 'Validation Error',
                    message: error.details[0].message
                });
            }

            const { walletAddress, depositAmount, roomId, rewards, kills } = value;

            // Prepare update object
            const updates = {};
            if (rewards !== undefined) updates.rewards = rewards;
            if (kills !== undefined) updates.kills = kills;

            // Update data in Supabase matching all 3 keys
            const { data, error: supabaseError } = await supabase
                .from('KillersArena_GameStats')
                .update(updates)
                .eq('wallet_address', walletAddress)
                .eq('deposit_amount', depositAmount)
                .eq('room_id', roomId)
                .select();

            if (supabaseError) {
                throw new Error(`Supabase error: ${supabaseError.message}`);
            }

            if (!data || data.length === 0) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'No record found matching Wallet + Deposit + Room'
                });
            }

            const updatedRecord = data[0];

            res.status(200).json({
                success: true,
                message: 'Game stats updated successfully',
                data: updatedRecord
            });

            logger.info('Game stats updated successfully', {
                id: updatedRecord.id,
                walletAddress: walletAddress
            });

        } catch (error) {
            logger.error('Error updating game stats', {
                error: error.message,
                body: req.body,
                ip: req.ip
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    }
}

module.exports = UserStatsController;
