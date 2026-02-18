module.exports = (sequelize, Sequelize) => {
    const Counter = sequelize.define('tbl_counter', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING(64),
            allowNull: true,
            unique: true
        },

        key: {
            type: Sequelize.STRING(100),
            allowNull: true,
            unique: true
        },

        value: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0
        },

        display_name: {
            type: Sequelize.STRING(100),
            allowNull: true
        },

        icon: {
            type: Sequelize.STRING(50),
            defaultValue: 'ti-circle'
        },

        prefix: {
            type: Sequelize.STRING(10),
            allowNull: true
        },

        suffix: {
            type: Sequelize.STRING(10),
            allowNull: true
        },

        category: {
            type: Sequelize.ENUM('main', 'secondary', 'analytics', 'system'),
            defaultValue: 'main'
        },

        position: {
            type: Sequelize.INTEGER,
            defaultValue: 1
        },

        is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        auto_update: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        min_value: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: true
        },

        max_value: {
            type: Sequelize.DECIMAL(15, 2),
            allowNull: true
        },

        step_value: {
            type: Sequelize.DECIMAL(10, 2),
            defaultValue: 1
        },

        metadata: {
            type: Sequelize.TEXT,
            allowNull: true,
            get() {
                const rawValue = this.getDataValue('metadata');
                return rawValue ? JSON.parse(rawValue) : {};
            },
            set(value) {
                this.setDataValue('metadata', JSON.stringify(value || {}));
            }
        },

        last_updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true
        },

        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        },

        updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
            onUpdate: Sequelize.NOW
        }
    }, {
        tableName: 'tbl_counter',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['token']
            },
            {
                unique: true,
                fields: ['key']
            },
            {
                fields: ['category']
            },
            {
                fields: ['position']
            },
            {
                fields: ['is_active']
            }
        ],
        hooks: {
            beforeCreate: (counter) => {
                if (!counter.token) {
                    const crypto = require('crypto');
                    counter.token = crypto.randomBytes(32).toString('hex');
                }
                
                if (!counter.display_name) {
                    counter.display_name = counter.key
                        .split('_')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                }
            }
        }
    });

    Counter.prototype.increment = async function(amount = 1) {
        this.value = parseFloat(this.value) + parseFloat(amount);
        this.updated_at = new Date();
        return this.save();
    };

    Counter.prototype.decrement = async function(amount = 1) {
        this.value = parseFloat(this.value) - parseFloat(amount);
        this.updated_at = new Date();
        return this.save();
    };

    Counter.prototype.setValue = async function(newValue) {
        if (this.min_value !== null && newValue < this.min_value) {
            throw new Error(`Value cannot be less than ${this.min_value}`);
        }
        if (this.max_value !== null && newValue > this.max_value) {
            throw new Error(`Value cannot be greater than ${this.max_value}`);
        }
        
        this.value = newValue;
        this.updated_at = new Date();
        return this.save();
    };

    // Static methods
    Counter.findByKey = async function(key) {
        return await this.findOne({ where: { key } });
    };

    Counter.findByToken = async function(token) {
        return await this.findOne({ where: { token } });
    };

    Counter.getAllCounters = async function() {
        const counters = await this.findAll({
            where: { is_active: true },
            order: [
                ['category', 'ASC'],
                ['position', 'ASC']
            ]
        });
        
        const result = {};
        counters.forEach(counter => {
            result[counter.key] = {
                value: counter.value,
                display_name: counter.display_name,
                icon: counter.icon,
                prefix: counter.prefix,
                suffix: counter.suffix,
                category: counter.category,
                position: counter.position,
                token: counter.token
            };
        });
        return result;
    };

    Counter.getMainCounters = async function() {
        return await this.findAll({
            where: { 
                category: 'main',
                is_active: true 
            },
            order: [['position', 'ASC']]
        });
    };

    Counter.updateCounter = async function(key, data, userId = null) {
        const counter = await this.findByKey(key);
        if (!counter) {
            throw new Error(`Counter with key "${key}" not found`);
        }
        
        // Update last_updated_by if userId provided
        if (userId) {
            data.last_updated_by = userId;
        }
        
        return await counter.update(data);
    };

    Counter.incrementCounter = async function(key, amount = 1, userId = null) {
        const counter = await this.findByKey(key);
        if (!counter) {
            throw new Error(`Counter with key "${key}" not found`);
        }
        
        if (userId) {
            counter.last_updated_by = userId;
        }
        
        return await counter.increment(amount);
    };

    Counter.decrementCounter = async function(key, amount = 1, userId = null) {
        const counter = await this.findByKey(key);
        if (!counter) {
            throw new Error(`Counter with key "${key}" not found`);
        }
        
        if (userId) {
            counter.last_updated_by = userId;
        }
        
        return await counter.decrement(amount);
    };

    Counter.resetAll = async function(userId = null) {
        const counters = await this.findAll();
        const updatePromises = counters.map(counter => {
            const resetValue = counter.metadata.default_value || 0;
            const updateData = { value: resetValue };
            
            if (userId) {
                updateData.last_updated_by = userId;
            }
            
            return counter.update(updateData);
        });
        
        return Promise.all(updatePromises);
    };

    // Default counter keys
    Counter.COUNTER_KEYS = {
        HAPPY_CUSTOMERS: 'happy_customers',
        VERIFIED_VENDORS: 'verified_vendors',
        APP_RATING: 'app_rating',
        TOTAL_CITIES: 'total_cities',
        TOTAL_BOOKINGS: 'total_bookings',
        ACTIVE_USERS: 'active_users',
        SUPPORT_RATING: 'support_rating',
        APP_DOWNLOADS: 'app_downloads',
        SHOW_COUNTERS: 'show_counters',
        AUTO_UPDATE: 'auto_update'
    };

    return Counter;
};