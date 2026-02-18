module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('tbl_vendor', 'gst_number', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('tbl_vendor', 'gst_number');
  }
};