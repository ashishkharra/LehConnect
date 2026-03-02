module.exports = (sequelize, Sequelize) => {
    const SiteSetting = sequelize.define('tbl_vendor_site_settings', {
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

        /* ===================================================== */
        /* ===== NOTIFICATION SETTINGS ===== */
        /* ===================================================== */

        send_to_all_cities: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        city_filter_enabled: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
        },

        selected_cities: {
            // Store as JSON string: [1,2,3,5]
            type: Sequelize.TEXT('long'),
            allowNull: true
        },

        notification_type: {
            type: Sequelize.ENUM('booking', 'cancellation', 'promotion'),
            defaultValue: 'booking'
        },

        instant_dispatch: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        /* ===================================================== */
        /* ===== COUNTER SETTINGS ===== */
        /* ===================================================== */

        happy_customers: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        verified_vendors: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        app_rating: {
            type: Sequelize.FLOAT,
            defaultValue: 0
        },

        total_cities: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        total_bookings: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        active_users: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        support_rating: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        app_downloads: {
            type: Sequelize.INTEGER,
            defaultValue: 0
        },

        show_counters: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },

        auto_update: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
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
        tableName: 'tbl_vendor_site_settings',
        timestamps: false
    });

    return SiteSetting;
};