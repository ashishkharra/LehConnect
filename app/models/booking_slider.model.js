module.exports = (sequelize, Sequelize) => {
    const BookingSliderImage = sequelize.define('tbl_booking_slider', {
        id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        token: {
            type: Sequelize.STRING,
            allowNull: true
        },
        image: {
            type: Sequelize.STRING,
            allowNull: true
        },
        title: {
            type: Sequelize.STRING(100),
            allowNull: true
        },
        subtitle: {
            type: Sequelize.STRING(200),
            allowNull: true
        },
        description: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        button_text: {
            type: Sequelize.STRING(50),
            allowNull: true
        },
        button_link: {
            type: Sequelize.STRING(500),
            allowNull: true
        },
        position: {
            type: Sequelize.INTEGER,
            defaultValue: 1
        },
        is_active: {
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
        tableName: 'tbl_site_slider',
        timestamps: false,
        hooks: {
            beforeUpdate: (slider) => {
                slider.updated_at = new Date();
            }
        }
    });

    return BookingSliderImage;
};