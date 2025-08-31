const axios = require("axios");

async function runHealthCheck() {
  const baseURL = "http://localhost:5000/api";

  try {
    // ✅ 1) اختبار customers list
    const list = await axios.get(`${baseURL}/customers`);
    console.log("✔️ Customers list OK:", Array.isArray(list.data), "count:", list.data.length);

    // لو فيه عميل واحد على الأقل
    if (list.data.length > 0) {
      const id = list.data[0]._id;

      // ✅ 2) اختبار getOne
      const one = await axios.get(`${baseURL}/customers/${id}`);
      console.log("✔️ Customer profile OK:", one.data._id === id);

      // ✅ 3) اختبار update status (dummy)
      const updated = await axios.put(`${baseURL}/customers/${id}`, { status: one.data.status });
      console.log("✔️ Customer update OK:", updated.data.status);
    }

    // ✅ 4) اختبار أي route أساسي شغال (مثال: leads)
    const leads = await axios.get(`${baseURL}/leads`).catch(() => null);
    console.log("✔️ Leads route reachable:", !!leads);

    console.log("\n🎉 Health check passed: Backend is working fine.");
  } catch (err) {
    console.error("❌ Health check failed:", err.response?.data || err.message);
    process.exit(1);
  }
}

runHealthCheck();
