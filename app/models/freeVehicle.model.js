module.exports = (sequelize, Sequelize) => {
    const VendorFreeVehicle = sequelize.define(
        "vendor_free_vehicle",
        {
            id: {
                type: Sequelize.BIGINT,
                primaryKey: true,
                autoIncrement: true
            },

            token: {
                type: Sequelize.STRING,
                allowNull: true,
                unique: true,
            },

            vendor_token: {
                type: Sequelize.STRING,
                allowNull: true
            },

            vehicle_type: {
                type: Sequelize.STRING,
                allowNull: true
            },

            vehicle_name: {
                type: Sequelize.STRING,
                allowNull: true
            },

            accept_type: {
                type: Sequelize.ENUM('INSTANT', 'APPROVAL', 'BID'),
                defaultValue: 'INSTANT',
                allowNull: true
            },

            // Location clarity
            state: {
                type: Sequelize.STRING(50),
                allowNull: true
            },

            city: {
                type: Sequelize.STRING(50),
                allowNull: true
            },

            location: {
                type: Sequelize.TEXT,
                allowNull: true
            },

            // latitude: {
            //     type: Sequelize.DECIMAL(10, 7),
            //     allowNull: true
            // },

            // longitude: {
            //     type: Sequelize.DECIMAL(10, 7),
            //     allowNull: true
            // },

            // Availability
            free_start_time: {
                type: Sequelize.DATE,
                allowNull: true
            },

            free_end_time: {
                type: Sequelize.DATE,
                allowNull: true
            },

            available_anywhere: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },

            // Status lifecycle
            status: {
                type: Sequelize.ENUM(
                    'AVAILABLE',
                    'REQUESTED',
                    'BOOKED',
                    'CANCELLED',
                    'EXPIRED'
                ),
                defaultValue: 'AVAILABLE'
            },

            flag: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false,
            },

            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            }
        },
        {
            tableName: "tbl_vendor_free_vehicles",
            timestamps: true,
            underscored: true,

            indexes: [
                {
                    fields: ['vendor_token']
                },
                {
                    fields: ['state', 'city']
                },
                {
                    fields: ['status']
                },
                {
                    fields: ['free_start_time', 'free_end_time']
                }
            ]
        }
    );

    return VendorFreeVehicle;
};