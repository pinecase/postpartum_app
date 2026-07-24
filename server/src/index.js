import { app } from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`月子中心护理记录系统已启动: http://localhost:${PORT}`));
