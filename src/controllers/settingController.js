import Setting from '../models/Setting.js';

// Get flash sale settings (Public)
export const getFlashSaleSettings = async (req, res) => {
  try {
    const settings = await Setting.findOne({ key: 'flashSale' });
    console.log('🔍 GET_FLASH_SALE_SETTINGS - Found:', settings ? settings.value : 'default');
    if (!settings) {
      // Default settings if not found
      return res.status(200).json({ isActive: false, endTime: null });
    }
    // Return the value object directly
    res.status(200).json(settings.value);
  } catch (error) {
    console.error('❌ GET_FLASH_SALE_SETTINGS Error:', error.message);
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

// Update flash sale settings (Admin)
console.log('UPDATE_FLASH_SALE_SETTINGS', 'Endpoint Hit');
export const updateFlashSaleSettings = async (req, res) => {
  try {
    console.log('UPDATE_FLASH_SALE_SETTINGS', req.body);
    const { isActive, endTime } = req.body;
    
    const settings = await Setting.findOneAndUpdate(
      { key: 'flashSale' },
      { 
        key: 'flashSale',
        value: { isActive, endTime },
        updatedAt: Date.now()
      },
      { new: true, upsert: true }
    );
    
    console.log('UPDATED_FLASH_SALE_SETTINGS', settings);
    res.status(200).json(settings.value);
  } catch (error) {
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
};
