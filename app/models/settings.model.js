module.exports = (sequelize, Sequelize) => {
    const SiteSetting = sequelize.define('site_setting', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },

        /* ===== BASIC INFO ===== */
        site_name: {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: 'LehConnect'
        },
        site_tagline: {
            type: Sequelize.STRING,
            allowNull: true
        },

        /* ===== BRANDING ===== */
        logo: {
            type: Sequelize.STRING,
            allowNull: true
        },
        favicon: {
            type: Sequelize.STRING,
            allowNull: true
        },

        /* ===== SLIDER CONTENT ===== */
        slider_title: {
            type: Sequelize.STRING,
            allowNull: true
        },
        slider_subtitle: {
            type: Sequelize.STRING,
            allowNull: true
        },
        slider_description: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        slider_button_text: {
            type: Sequelize.STRING,
            allowNull: true
        },
        slider_button_link: {
            type: Sequelize.STRING,
            allowNull: true
        },

        /* ===== COLORS ===== */
        text_color: {
            type: Sequelize.STRING,
            defaultValue: '#ffffff'
        },
        button_color: {
            type: Sequelize.STRING,
            defaultValue: '#6366f1'
        },

        /* ===== FLAGS ===== */
        slider_status: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },
        slider_animation: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        },
        updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        }
    }, {
        tableName: 'site_settings',
        timestamps: false
    });

    return SiteSetting;
};
