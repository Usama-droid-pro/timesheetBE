const axios = require('axios');

async function testAPIEndpoint() {
  try {
    const baseURL = 'http://localhost:4100'; // Adjust if different
    const osamaId = '6904a2a9988e2a6a7facf3a5';
    
    console.log('Testing API endpoint directly...');
    
    // Test the exact API call that frontend makes
    const url = `${baseURL}/api/tasklogs?userId=${osamaId}&startDate=2025-10-01&endDate=2025-10-31`;
    console.log('URL:', url);
    
    const response = await axios.get(url);
    
    console.log('✅ API Response Status:', response.status);
    console.log('✅ API Response Data:', {
      success: response.data.success,
      message: response.data.message,
      taskLogsCount: response.data.data?.taskLogs?.length || 0
    });
    
    if (response.data.data?.taskLogs?.length > 0) {
      console.log('✅ Sample task log:', response.data.data.taskLogs[0]);
    }
    
  } catch (error) {
    console.log('❌ API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

testAPIEndpoint();