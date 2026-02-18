module.exports = (sequelize, Sequelize) => {
    const Customer = sequelize.define("customer", {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        token: {
            type: Sequelize.INTEGER,
            primaryKey: true,
        },
        ref_code: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        referer_code: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        referer_code_used: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        f_name: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        l_name: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        contact: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        alt_contact: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        email: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        password: {
            type: Sequelize.STRING,
            allowNull: true
        },
        role: {
            type: Sequelize.ENUM('CUSTOMER'),
            default: 'CUSTOMER'
        },
        create_date: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.NOW,
        },
        location: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        address: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        ip: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        user_agent: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        feedback: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        image: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        role: {
            type: Sequelize.STRING,
            allowNull: true,
        },
        status: {
            type: Sequelize.INTEGER,
            defaultValue: 1,
            allowNull: false,
        },
        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            allowNull: false,
        },
    }, {
        tableName: 'tbl_customer',
        freezeTableName: true,
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: false,
    });

    return Customer;
};
