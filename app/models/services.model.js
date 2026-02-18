module.exports = (sequelize, Sequelize) => {
    const Service = sequelize.define("tbl_service", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true
        },

        name: {
            type: Sequelize.STRING(100),
            allowNull: true,
            unique: true,
            comment: 'Service name (e.g. Local Ride, Outstation, Airport Transfer)'
        },

        code: {
            type: Sequelize.STRING(50),
            allowNull: true,
            unique: true,
            comment: 'Unique service code (e.g. LOCAL, OUTSTATION, AIRPORT)'
        },

        description: {
            type: Sequelize.STRING,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active',
            allowNull: true
        },

        sort_order: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            comment: 'Used for display ordering'
        },

        create_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW
        },

        update_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW
        }

    }, {
        tableName: 'tbl_service',
        freezeTableName: true,
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: 'update_date'
    });

    return Service;
};