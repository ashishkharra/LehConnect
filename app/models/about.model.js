module.exports = (sequelize, Sequelize) => {
    const AboutSection = sequelize.define('AboutSection', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        token: {
            type: Sequelize.STRING,
            allowNull: true
        },

        heading: {
            type: Sequelize.STRING,
            allowNull: true
        },

        title: {
            type: Sequelize.STRING,
            allowNull: true
        },

        description: {
            type: Sequelize.TEXT,
            allowNull: true
        },

        image: {
            type: Sequelize.STRING,
            allowNull: true
        },

        status: {
            type: Sequelize.ENUM('active', 'inactive'),
            defaultValue: 'active',
            allowNull: true
        }

    }, {
        tableName: 'tbl_about_sections',
        timestamps: true,
        createdAt: 'create_date',
        updatedAt: 'update_date'
    });

    return AboutSection;
};
