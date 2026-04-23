module.exports = (sequelize, Sequelize) => {
    const Enquiry = sequelize.define("enquiry", {

        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },

        token: {
            type: Sequelize.STRING(100),
            allowNull: true,
            unique: true,
            comment: "Public enquiry identifier"
        },

        name: {
            type: Sequelize.STRING(100),
            allowNull: true
        },

        email: {
            type: Sequelize.STRING(150),
            allowNull: true
        },

        mobile: {
            type: Sequelize.STRING(20),
            allowNull: true
        },

        requirement_type: {
            type: Sequelize.ENUM(
                "hotel",
                "flight",
                "insurance",
                "cab",
                "tour",
                "package",
                "event",
                "other"
            ),
            allowNull: true,
            defaultValue: "hotel"
        },

        enquiry_date: {
            type: Sequelize.DATEONLY,
            allowNull: true
        },

        enquiry_time: {
            type: Sequelize.TIME,
            allowNull: true
        },

        location: {
            type: Sequelize.STRING(255),
            allowNull: true
        },

        adults: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1
        },

        children: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },

        comments: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM(
                "new",
                "contacted",
                "in_progress",
                "converted",
                "closed",
                "cancelled"
            ),
            defaultValue: "new"
        },

        flag: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            comment: "0=normal,1=important,2=spam,3=archived"
        },

        source: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: "web | app | whatsapp | admin"
        },

        ip_address: {
            type: Sequelize.STRING(50),
            allowNull: true
        },
        
        user_agent: {
            type: Sequelize.STRING(255),
            allowNull: true
        }

    }, {
        tableName: "tbl_enquiry",
        freezeTableName: true,
        timestamps: true,
        createdAt: "create_date",
        updatedAt: "update_date",
        indexes: [
            { fields: ["token"] },
            { fields: ["mobile"] },
            { fields: ["status"] },
            { fields: ["requirement_type"] }
        ]
    });

    return Enquiry;
};
