import Phaser from 'phaser';
import multiplayerManager from '../utils/multiplayerManager';

export default class GameScene extends Phaser.Scene {
	constructor() {
		super({ key: 'GameScene' });

		// 游戏状态
		this.player = null;
		this.otherPlayers = new Map(); // 存储其他玩家
		this.cursors = null;
		this.wasdKeys = null;
		this.spaceKey = null;
		this.eKey = null;
		this.qKey = null;

		// 游戏对象组
		this.ingredients = null;
		this.stations = null;
		this.plates = null;
		this.washStation = null; // 洗碗槽
		this.groundItems = null; // 地面物品组
		this.orders = [];
		this.currentOrder = null;

		// 玩家状态
		this.playerHolding = null;
		this.score = 0;
		this.timeLeft = 180; // 3分钟
		this.completedOrders = 0;

		// UI元素
		this.scoreText = null;
		this.timerText = null;
		this.orderText = null;
		this.holdingText = null;
		this.messageText = null;

		// 视觉反馈元素
		this.playerHoldingSprite = null;
		this.plateContentsSprites = [];
		this.stationContentsSprites = [];

		// 游戏配置
		this.gameConfig = {
			playerSpeed: 160,
			interactionDistance: 40,
			cookingTime: 3000, // 3秒烹饪时间
			choppingTime: 2000, // 2秒切菜时间
			fireCountdownTime: 5000, // 5秒着火倒计时
			washTime: 2000, // 2秒洗碗时间
		};

		// 食材和菜谱配置 - 调整订单时间
		this.recipes = {
			simple_salad: {
				name: '简单沙拉',
				ingredients: ['chopped_lettuce'],
				points: 10,
				time: 60, // 增加到60秒
			},
			tomato_salad: {
				name: '番茄沙拉',
				ingredients: ['chopped_tomato', 'chopped_lettuce'],
				points: 15,
				time: 90, // 增加到90秒
			},
			sandwich: {
				name: '三明治',
				ingredients: ['bread', 'cooked_tomato', 'chopped_lettuce'],
				points: 25,
				time: 120, // 增加到120秒
			},
			cooked_meal: {
				name: '熟食套餐',
				ingredients: ['cooked_tomato', 'cooked_lettuce', 'bread'],
				points: 30,
				time: 150, // 增加到150秒
			},
		};

		// 动画状态
		this.isProcessing = false;
		this.processingStation = null;

		// 游戏状态标志
		this.gameStarted = false;
		this.gameEnded = false;

		// 多人游戏相关
		this.gameMode = 'single'; // 'single' 或 'multiplayer'
		this.currentPlayerId = null;
		this.syncTimer = null;
		this.lastSyncPosition = null;
		this.lastSyncHolding = null; // 添加手持物品同步状态
		this.isSyncingPosition = false;

		// 游戏对象ID管理
		this.objectIdCounter = 0;
		this.plateIdMap = new Map(); // 盘子对象到ID的映射
		this.stationIdMap = new Map(); // 工作台对象到ID的映射
		this.washStationIdMap = new Map(); // 洗碗槽对象到ID的映射
		this.groundItemIdMap = new Map(); // 地面物品对象到ID的映射

		// 盘子管理系统 - 新增
		this.platePool = []; // 盘子池，固定4个盘子
		this.maxPlates = 4; // 最大盘子数量

		// 瓦片地板
		this.floorTiles = null;
		// 墙壁
		this.walls = null;
	}

	preload() {
		// 添加资源加载监听器用于调试
		this.load.on('filecomplete', (key, type, data) => {
			console.log('✅ 资源加载完成:', { key, type, success: !!data });
		});

		this.load.on('loaderror', (file) => {
			console.error('❌ 资源加载失败:', file.key, file.src);
		});

		// 加载瓦片贴图资源
		this.load.image(
			'floors',
			'src/assets/tiled/Floors_original_shading_TILESET_A5_.png'
		);
		this.load.image('walls', 'src/assets/tiled/Walls_2_TILESET_A4_.png');
		this.load.image('kitchen_01', 'src/assets/tiled/B-C-D-E_Kitchen_01.png');
		this.load.image('kitchen_02', 'src/assets/tiled/B-C-D-E_Kitchen_02.png');
		this.load.image('kitchen_12', 'src/assets/tiled/12_Kitchen.png');

		// 加载角色精灵表
		this.load.spritesheet('edward', 'src/assets/character/Edward.png', {
			frameWidth: 32,
			frameHeight: 32,
		});
		this.load.spritesheet('abby', 'src/assets/character/Abby.png', {
			frameWidth: 32,
			frameHeight: 32,
		});

		// 创建像素艺术风格的游戏对象
		this.createPixelArt();

		// 加载用户切好的厨房设备图片
		this.load.image('cutting_station_new', 'src/assets/tiled/切菜台.png');
		this.load.image('cooking_station_new', 'src/assets/tiled/烹饪台.png');
		this.load.image('wash_station_new', 'src/assets/tiled/洗手池.png');
		this.load.image('serving_station_new', 'src/assets/tiled/餐桌.png');
		this.load.image('plate_new', 'src/assets/tiled/盘子.png');
		console.log('📦 加载用户切好的厨房设备图片...');
	}

	createPixelArt() {
		// 设置像素完美渲染
		this.cameras.main.setRoundPixels(true);

		// 创建基础纹理
		this.createIngredientSprites();
		this.createStationSprites(); // 重新添加工作台纹理创建
		this.createUISprites();
	}

	createTileTextures() {
		console.log('🎨 开始创建瓦片纹理...');

		// 检查资源是否已加载
		const floorsTexture = this.textures.get('floors');
		const wallsTexture = this.textures.get('walls');
		console.log('📦 检查资源加载状态:', {
			floors: floorsTexture.key !== '__MISSING',
			walls: wallsTexture.key !== '__MISSING',
			kitchen_01: this.textures.get('kitchen_01').key !== '__MISSING',
			kitchen_02: this.textures.get('kitchen_02').key !== '__MISSING',
			kitchen_12: this.textures.get('kitchen_12').key !== '__MISSING',
		});

		// 从地板贴图中切出不同的地板纹理 (32x32像素)
		const floorTileSize = 32;

		// 创建厨房地板纹理 - 选择浅色木地板 (第1个瓦片)
		const kitchenFloorRT = this.add.renderTexture(
			0,
			0,
			floorTileSize,
			floorTileSize
		);
		// 使用正确的draw语法：draw(key, frame, x, y, alpha, tint)
		kitchenFloorRT.drawFrame('floors', null, 0, 0);
		kitchenFloorRT.saveTexture('kitchen_floor');
		kitchenFloorRT.setVisible(false);
		console.log('🏠 创建厨房地板纹理:', kitchenFloorRT);

		// 创建走廊地板纹理 - 选择石砖地板 (第3个瓦片)
		const corridorFloorRT = this.add.renderTexture(
			0,
			0,
			floorTileSize,
			floorTileSize
		);
		// 先创建一个临时sprite来获取正确的帧
		const tempFloorSprite = this.add.sprite(0, 0, 'floors');
		tempFloorSprite.setCrop(floorTileSize * 2, 0, floorTileSize, floorTileSize);
		corridorFloorRT.draw(tempFloorSprite, 0, 0);
		tempFloorSprite.destroy();
		corridorFloorRT.saveTexture('corridor_floor');
		corridorFloorRT.setVisible(false);
		console.log('🚪 创建走廊地板纹理:', corridorFloorRT);

		// 从墙壁贴图中切出墙壁纹理 (32x32像素)
		const wallTileSize = 32;

		// 创建厨房墙壁纹理 (第1个瓦片)
		const kitchenWallRT = this.add.renderTexture(
			0,
			0,
			wallTileSize,
			wallTileSize
		);
		kitchenWallRT.drawFrame('walls', null, 0, 0);
		kitchenWallRT.saveTexture('kitchen_wall');
		kitchenWallRT.setVisible(false);
		console.log('🧱 创建厨房墙壁纹理:', kitchenWallRT);

		// 创建装饰墙壁纹理 (第2个瓦片)
		const decorWallRT = this.add.renderTexture(
			0,
			0,
			wallTileSize,
			wallTileSize
		);
		const tempWallSprite = this.add.sprite(0, 0, 'walls');
		tempWallSprite.setCrop(wallTileSize, 0, wallTileSize, wallTileSize);
		decorWallRT.draw(tempWallSprite, 0, 0);
		tempWallSprite.destroy();
		decorWallRT.saveTexture('decorative_wall');
		decorWallRT.setVisible(false);
		console.log('🎨 创建装饰墙壁纹理:', decorWallRT);

		// 从厨房素材中切出设备纹理
		this.createKitchenEquipmentTextures();

		console.log('✅ 瓦片纹理创建完成');

		// 验证纹理是否真的创建成功
		this.time.delayedCall(100, () => {
			console.log('🔍 验证纹理存在性:', {
				kitchen_floor: this.textures.exists('kitchen_floor'),
				corridor_floor: this.textures.exists('corridor_floor'),
				kitchen_wall: this.textures.exists('kitchen_wall'),
				decorative_wall: this.textures.exists('decorative_wall'),
				new_cutting_station: this.textures.exists('new_cutting_station'),
				new_cooking_station: this.textures.exists('new_cooking_station'),
				new_wash_station: this.textures.exists('new_wash_station'),
				new_serving_station: this.textures.exists('new_serving_station'),
				new_trash: this.textures.exists('new_trash'),
				new_extinguisher: this.textures.exists('new_extinguisher'),
			});
		});
	}

	createKitchenEquipmentTextures() {
		// 直接使用用户切好的厨房设备图片
		console.log('🔧 使用用户切好的厨房设备图片...');

		// 检查用户切好的图片是否存在
		console.log('📦 检查用户切好的图片:', {
			cutting_station_new: this.textures.exists('cutting_station_new'),
			cooking_station_new: this.textures.exists('cooking_station_new'),
			wash_station_new: this.textures.exists('wash_station_new'),
			serving_station_new: this.textures.exists('serving_station_new'),
			plate_new: this.textures.exists('plate_new'),
		});

		// 直接复制用户切好的图片作为新纹理
		try {
			if (this.textures.exists('cutting_station_new')) {
				const sourceTexture = this.textures.get('cutting_station_new');
				this.textures.addImage(
					'new_cutting_station',
					sourceTexture.source[0].image
				);
				console.log('🔪 使用用户切好的切菜台图片');
			}

			if (this.textures.exists('cooking_station_new')) {
				const sourceTexture = this.textures.get('cooking_station_new');
				this.textures.addImage(
					'new_cooking_station',
					sourceTexture.source[0].image
				);
				console.log('🔥 使用用户切好的烹饪台图片');
			}

			if (this.textures.exists('wash_station_new')) {
				const sourceTexture = this.textures.get('wash_station_new');
				this.textures.addImage(
					'new_wash_station',
					sourceTexture.source[0].image
				);
				console.log('🚿 使用用户切好的洗手池图片');
			}

			if (this.textures.exists('serving_station_new')) {
				const sourceTexture = this.textures.get('serving_station_new');
				this.textures.addImage(
					'new_serving_station',
					sourceTexture.source[0].image
				);
				console.log('🍽️ 使用用户切好的餐桌图片');
			}

			if (this.textures.exists('plate_new')) {
				const sourceTexture = this.textures.get('plate_new');
				this.textures.addImage('new_plate', sourceTexture.source[0].image);
				console.log('🍽️ 使用用户切好的盘子图片');
			}

			// 垃圾桶和灭火器仍然使用kitchen_12（如果存在）
			if (this.textures.exists('kitchen_12')) {
				// 垃圾桶 - 从kitchen_12左上角切割（x=0, y=0, 32x32）
				const trashRT = this.add.renderTexture(0, 0, 32, 32);
				trashRT.draw('kitchen_12', 0, 0);
				trashRT.saveTexture('new_trash');
				trashRT.setVisible(false);
				console.log('🗑️ 创建垃圾桶纹理成功 - 从kitchen_12切割');

				// 灭火器 - 从kitchen_12切割（x=32, y=0, 32x32）
				const extinguisherRT = this.add.renderTexture(0, 0, 32, 32);
				extinguisherRT.draw('kitchen_12', -32, 0);
				extinguisherRT.saveTexture('new_extinguisher');
				extinguisherRT.setVisible(false);
				console.log('🧯 创建灭火器纹理成功 - 从kitchen_12切割');
			}
		} catch (error) {
			console.error('❌ 使用厨房设备图片失败:', error);
		}

		console.log('✅ 厨房设备纹理创建完成');

		// 验证纹理是否真的创建成功
		console.log('🔍 验证新纹理存在性:', {
			new_cutting_station: this.textures.exists('new_cutting_station'),
			new_cooking_station: this.textures.exists('new_cooking_station'),
			new_serving_station: this.textures.exists('new_serving_station'),
			new_wash_station: this.textures.exists('new_wash_station'),
			new_trash: this.textures.exists('new_trash'),
			new_extinguisher: this.textures.exists('new_extinguisher'),
			new_plate: this.textures.exists('new_plate'),
		});
	}

	createIngredientSprites() {
		// 精美番茄 - 参考真实番茄
		const tomatoGraphics = this.add.graphics();
		// 主体红色
		tomatoGraphics.fillStyle(0xe53e3e); // 鲜艳红色
		tomatoGraphics.fillCircle(16, 18, 11);
		// 顶部凹陷
		tomatoGraphics.fillStyle(0xc53030);
		tomatoGraphics.fillCircle(16, 12, 8);
		// 绿色蒂部
		tomatoGraphics.fillStyle(0x38a169);
		tomatoGraphics.fillRect(13, 8, 6, 4);
		tomatoGraphics.fillRect(15, 6, 2, 6);
		// 高光效果
		tomatoGraphics.fillStyle(0xff6b6b);
		tomatoGraphics.fillCircle(12, 14, 3);
		tomatoGraphics.fillCircle(20, 16, 2);
		// 阴影
		tomatoGraphics.fillStyle(0xc53030);
		tomatoGraphics.fillCircle(18, 22, 4);
		tomatoGraphics.generateTexture('tomato', 32, 32);
		tomatoGraphics.destroy();

		// 切好的番茄 - 更真实的切片
		const choppedTomatoGraphics = this.add.graphics();
		// 番茄片1
		choppedTomatoGraphics.fillStyle(0xe53e3e);
		choppedTomatoGraphics.fillCircle(10, 16, 6);
		choppedTomatoGraphics.fillStyle(0xff8e8e);
		choppedTomatoGraphics.fillCircle(10, 16, 4);
		// 番茄籽
		choppedTomatoGraphics.fillStyle(0xfff5b7);
		choppedTomatoGraphics.fillCircle(8, 15, 1);
		choppedTomatoGraphics.fillCircle(12, 17, 1);

		// 番茄片2
		choppedTomatoGraphics.fillStyle(0xe53e3e);
		choppedTomatoGraphics.fillCircle(22, 16, 6);
		choppedTomatoGraphics.fillStyle(0xff8e8e);
		choppedTomatoGraphics.fillCircle(22, 16, 4);
		// 番茄籽
		choppedTomatoGraphics.fillStyle(0xfff5b7);
		choppedTomatoGraphics.fillCircle(20, 15, 1);
		choppedTomatoGraphics.fillCircle(24, 17, 1);
		choppedTomatoGraphics.generateTexture('chopped_tomato', 32, 32);
		choppedTomatoGraphics.destroy();

		// 烹饪番茄 - 焦糖化效果
		const cookedTomatoGraphics = this.add.graphics();
		cookedTomatoGraphics.fillStyle(0xb91c1c); // 深红色
		cookedTomatoGraphics.fillRect(6, 12, 20, 8);
		cookedTomatoGraphics.fillStyle(0x991b1b);
		cookedTomatoGraphics.fillRect(8, 14, 16, 4);
		// 焦糖边缘
		cookedTomatoGraphics.fillStyle(0x7f1d1d);
		cookedTomatoGraphics.fillRect(6, 12, 20, 2);
		cookedTomatoGraphics.fillRect(6, 18, 20, 2);
		// 蒸汽效果
		cookedTomatoGraphics.fillStyle(0xf3f4f6);
		cookedTomatoGraphics.fillCircle(10, 8, 1);
		cookedTomatoGraphics.fillCircle(16, 6, 1);
		cookedTomatoGraphics.fillCircle(22, 8, 1);
		cookedTomatoGraphics.generateTexture('cooked_tomato', 32, 32);
		cookedTomatoGraphics.destroy();

		// 烤糊的番茄 - 黑色焦糊效果
		const burntTomatoGraphics = this.add.graphics();
		burntTomatoGraphics.fillStyle(0x1a1a1a); // 黑色
		burntTomatoGraphics.fillRect(6, 12, 20, 8);
		burntTomatoGraphics.fillStyle(0x0f0f0f);
		burntTomatoGraphics.fillRect(8, 14, 16, 4);
		// 焦糊边缘
		burntTomatoGraphics.fillStyle(0x2d1b1b);
		burntTomatoGraphics.fillRect(6, 12, 20, 2);
		burntTomatoGraphics.fillRect(6, 18, 20, 2);
		// 烟雾效果
		burntTomatoGraphics.fillStyle(0x666666);
		burntTomatoGraphics.fillCircle(10, 8, 1);
		burntTomatoGraphics.fillCircle(16, 6, 1);
		burntTomatoGraphics.fillCircle(22, 8, 1);
		burntTomatoGraphics.generateTexture('burnt_tomato', 32, 32);
		burntTomatoGraphics.destroy();

		// 精美生菜 - 层次丰富
		const lettuceGraphics = this.add.graphics();
		// 外层叶子 - 深绿
		lettuceGraphics.fillStyle(0x16a34a);
		lettuceGraphics.fillEllipse(16, 16, 24, 18);
		// 中层叶子 - 中绿
		lettuceGraphics.fillStyle(0x22c55e);
		lettuceGraphics.fillEllipse(16, 16, 18, 14);
		// 内层叶子 - 浅绿
		lettuceGraphics.fillStyle(0x4ade80);
		lettuceGraphics.fillEllipse(16, 16, 12, 10);
		// 叶脉纹理
		lettuceGraphics.fillStyle(0x15803d);
		lettuceGraphics.fillRect(16, 8, 1, 16);
		lettuceGraphics.fillRect(12, 12, 8, 1);
		lettuceGraphics.fillRect(14, 20, 4, 1);
		// 高光
		lettuceGraphics.fillStyle(0x86efac);
		lettuceGraphics.fillCircle(12, 12, 2);
		lettuceGraphics.generateTexture('lettuce', 32, 32);
		lettuceGraphics.destroy();

		// 切好的生菜 - 碎片效果
		const choppedLettuceGraphics = this.add.graphics();
		// 生菜碎片1
		choppedLettuceGraphics.fillStyle(0x22c55e);
		choppedLettuceGraphics.fillRect(6, 12, 6, 8);
		choppedLettuceGraphics.fillStyle(0x4ade80);
		choppedLettuceGraphics.fillRect(7, 13, 4, 6);

		// 生菜碎片2
		choppedLettuceGraphics.fillStyle(0x22c55e);
		choppedLettuceGraphics.fillRect(14, 10, 8, 6);
		choppedLettuceGraphics.fillStyle(0x4ade80);
		choppedLettuceGraphics.fillRect(15, 11, 6, 4);

		// 生菜碎片3
		choppedLettuceGraphics.fillStyle(0x22c55e);
		choppedLettuceGraphics.fillRect(20, 16, 6, 10);
		choppedLettuceGraphics.fillStyle(0x4ade80);
		choppedLettuceGraphics.fillRect(21, 17, 4, 8);
		choppedLettuceGraphics.generateTexture('chopped_lettuce', 32, 32);
		choppedLettuceGraphics.destroy();

		// 烹饪生菜 - 炒制效果
		const cookedLettuceGraphics = this.add.graphics();
		cookedLettuceGraphics.fillStyle(0x15803d); // 深绿色
		cookedLettuceGraphics.fillRect(6, 12, 20, 8);
		cookedLettuceGraphics.fillStyle(0x166534);
		cookedLettuceGraphics.fillRect(8, 14, 16, 4);
		// 炒制边缘
		cookedLettuceGraphics.fillStyle(0x14532d);
		cookedLettuceGraphics.fillRect(6, 12, 20, 2);
		cookedLettuceGraphics.fillRect(6, 18, 20, 2);
		// 蒸汽
		cookedLettuceGraphics.fillStyle(0xf3f4f6);
		cookedLettuceGraphics.fillCircle(12, 8, 1);
		cookedLettuceGraphics.fillCircle(20, 6, 1);
		cookedLettuceGraphics.generateTexture('cooked_lettuce', 32, 32);
		cookedLettuceGraphics.destroy();

		// 烤糊的生菜 - 黑色焦糊效果
		const burntLettuceGraphics = this.add.graphics();
		burntLettuceGraphics.fillStyle(0x1a1a1a); // 黑色
		burntLettuceGraphics.fillRect(6, 12, 20, 8);
		burntLettuceGraphics.fillStyle(0x0f0f0f);
		burntLettuceGraphics.fillRect(8, 14, 16, 4);
		// 焦糊边缘
		burntLettuceGraphics.fillStyle(0x1b2d1b);
		burntLettuceGraphics.fillRect(6, 12, 20, 2);
		burntLettuceGraphics.fillRect(6, 18, 20, 2);
		// 烟雾效果
		burntLettuceGraphics.fillStyle(0x666666);
		burntLettuceGraphics.fillCircle(12, 8, 1);
		burntLettuceGraphics.fillCircle(20, 6, 1);
		burntLettuceGraphics.generateTexture('burnt_lettuce', 32, 32);
		burntLettuceGraphics.destroy();

		// 精美面包 - 法式面包风格
		const breadGraphics = this.add.graphics();
		// 面包主体
		breadGraphics.fillStyle(0xd97706); // 金黄色
		breadGraphics.fillRoundedRect(4, 12, 24, 8, 3);
		// 面包皮
		breadGraphics.fillStyle(0xb45309);
		breadGraphics.strokeRoundedRect(4, 12, 24, 8, 3);
		// 面包纹理
		breadGraphics.fillStyle(0xf59e0b);
		breadGraphics.fillRect(8, 15, 2, 1);
		breadGraphics.fillRect(12, 14, 2, 1);
		breadGraphics.fillRect(16, 16, 2, 1);
		breadGraphics.fillRect(20, 15, 2, 1);
		// 高光
		breadGraphics.fillStyle(0xfbbf24);
		breadGraphics.fillRect(6, 13, 20, 1);
		// 阴影
		breadGraphics.fillStyle(0x92400e);
		breadGraphics.fillRect(4, 19, 24, 1);
		breadGraphics.generateTexture('bread', 32, 32);
		breadGraphics.destroy();
	}

	createStationSprites() {
		// 创建基础工作台纹理作为回退
		const stationGraphics = this.add.graphics();

		// 切菜台 - 绿色
		stationGraphics.fillStyle(0x2d5016);
		stationGraphics.fillRect(0, 0, 64, 32);
		stationGraphics.fillStyle(0x3d6b1f);
		stationGraphics.fillRect(2, 2, 60, 28);
		stationGraphics.generateTexture('cutting_station', 64, 32);

		// 烹饪台 - 红色
		stationGraphics.clear();
		stationGraphics.fillStyle(0x7f1d1d);
		stationGraphics.fillRect(0, 0, 64, 32);
		stationGraphics.fillStyle(0x991b1b);
		stationGraphics.fillRect(2, 2, 60, 28);
		stationGraphics.generateTexture('cooking_station', 64, 32);

		// 出餐台 - 蓝色
		stationGraphics.clear();
		stationGraphics.fillStyle(0x1e3a8a);
		stationGraphics.fillRect(0, 0, 64, 32);
		stationGraphics.fillStyle(0x2563eb);
		stationGraphics.fillRect(2, 2, 60, 28);
		stationGraphics.generateTexture('serving_station', 64, 32);

		stationGraphics.destroy();

		console.log('✅ 基础工作台纹理创建完成');
	}

	createUISprites() {
		// 创建进度条纹理
		const progressBarGraphics = this.add.graphics();
		progressBarGraphics.fillStyle(0x333333);
		progressBarGraphics.fillRect(0, 0, 60, 8);
		progressBarGraphics.fillStyle(0x2ed573);
		progressBarGraphics.fillRect(2, 2, 56, 4);
		progressBarGraphics.generateTexture('progress_bar', 60, 8);
		progressBarGraphics.destroy();

		// 创建专门的粒子纹理（白色小点）
		const particleGraphics = this.add.graphics();
		particleGraphics.fillStyle(0xffffff);
		particleGraphics.fillCircle(2, 2, 2);
		particleGraphics.generateTexture('particle', 4, 4);
		particleGraphics.destroy();
	}

	create() {
		// 创建瓦片纹理（必须在资源加载完成后）
		this.createTileTextures();

		// 创建厨房布局
		this.createKitchenLayout();

		// 创建角色动画
		this.createCharacterAnimations();

		// 设置控制
		this.setupControls();

		// 创建游戏对象
		this.createGameObjects();

		// 设置碰撞检测
		this.setupCollisions();

		// 设置粒子效果
		this.setupParticleEffects();

		// 创建UI
		this.createUI();

		// 开始游戏
		this.startGame();
	}

	createCharacterAnimations() {
		// 创建Edward角色动画 (男性)
		this.anims.create({
			key: 'edward_idle_down',
			frames: [{ key: 'edward', frame: 0 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'edward_walk_down',
			frames: this.anims.generateFrameNumbers('edward', { start: 0, end: 2 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'edward_idle_up',
			frames: [{ key: 'edward', frame: 9 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'edward_walk_up',
			frames: this.anims.generateFrameNumbers('edward', { start: 9, end: 11 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'edward_idle_left',
			frames: [{ key: 'edward', frame: 3 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'edward_walk_left',
			frames: this.anims.generateFrameNumbers('edward', { start: 3, end: 5 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'edward_idle_right',
			frames: [{ key: 'edward', frame: 6 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'edward_walk_right',
			frames: this.anims.generateFrameNumbers('edward', { start: 6, end: 8 }),
			frameRate: 8,
			repeat: -1,
		});

		// 创建Abby角色动画 (女性)
		this.anims.create({
			key: 'abby_idle_down',
			frames: [{ key: 'abby', frame: 0 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'abby_walk_down',
			frames: this.anims.generateFrameNumbers('abby', { start: 0, end: 2 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'abby_idle_up',
			frames: [{ key: 'abby', frame: 9 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'abby_walk_up',
			frames: this.anims.generateFrameNumbers('abby', { start: 9, end: 11 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'abby_idle_left',
			frames: [{ key: 'abby', frame: 3 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'abby_walk_left',
			frames: this.anims.generateFrameNumbers('abby', { start: 3, end: 5 }),
			frameRate: 8,
			repeat: -1,
		});

		this.anims.create({
			key: 'abby_idle_right',
			frames: [{ key: 'abby', frame: 6 }],
			frameRate: 1,
		});

		this.anims.create({
			key: 'abby_walk_right',
			frames: this.anims.generateFrameNumbers('abby', { start: 6, end: 8 }),
			frameRate: 8,
			repeat: -1,
		});
	}

	initSinglePlayerGame() {
		// 创建单人玩家（男性厨师）
		this.player = this.physics.add.sprite(100, 300, 'edward');
		this.player.setCollideWorldBounds(true);
		this.player.setDepth(10);
		this.player.setSize(24, 32);
		this.player.setData('playerId', 'single_player');
		this.player.setData('playerType', 'male');

		// 设置玩家动画
		this.player.direction = 'down';
		this.player.characterType = 'edward';
		this.player.anims.play('edward_idle_down');

		// 玩家创建后立即设置碰撞检测
		this.setupPlayerCollisions();
	}

	initMultiplayerGame() {
		// 获取当前玩家信息
		this.currentPlayerId = multiplayerManager.playerId;
		const roomData = multiplayerManager.getRoomData();

		console.log('初始化多人游戏:', {
			currentPlayerId: this.currentPlayerId,
			roomData: roomData,
		});

		// 确保当前玩家始终被创建的标志
		let currentPlayerCreated = false;

		if (roomData && roomData.players && Array.isArray(roomData.players)) {
			// 为每个玩家创建角色
			roomData.players.forEach((playerData, index) => {
				const isCurrentPlayer = playerData.playerId === this.currentPlayerId;
				const playerType = index === 0 ? 'male' : 'female'; // 第一个玩家是男性，第二个是女性
				const texture = playerType === 'male' ? 'edward' : 'abby';

				// 设置初始位置（如果没有位置信息）
				const startX = playerData.position?.x || 100 + index * 100;
				const startY = playerData.position?.y || 300;

				console.log('创建玩家:', {
					playerId: playerData.playerId,
					isCurrentPlayer,
					playerType,
					texture,
					position: { x: startX, y: startY },
				});

				if (isCurrentPlayer) {
					// 创建当前玩家
					this.player = this.physics.add.sprite(startX, startY, texture);
					this.player.setCollideWorldBounds(true);
					this.player.setDepth(10);
					this.player.setSize(24, 32);
					this.player.setData('playerId', playerData.playerId);
					this.player.setData('playerType', playerType);

					currentPlayerCreated = true;
					console.log('当前玩家创建完成:', this.player);
				} else {
					// 创建其他玩家
					const otherPlayer = this.physics.add.sprite(startX, startY, texture);
					otherPlayer.setCollideWorldBounds(true);
					otherPlayer.setDepth(10);
					otherPlayer.setSize(24, 32);
					otherPlayer.setData('playerId', playerData.playerId);
					otherPlayer.setData('playerType', playerType);

					// 添加玩家名称标签
					const nameText = this.add.text(
						startX,
						startY - 40,
						playerData.nickname || `玩家${index + 1}`,
						{
							fontSize: '12px',
							fill: '#ffffff',
							backgroundColor: '#000000',
							padding: { x: 4, y: 2 },
						}
					);
					nameText.setOrigin(0.5);
					nameText.setDepth(11);

					this.otherPlayers.set(playerData.playerId, {
						sprite: otherPlayer,
						nameText: nameText,
						data: playerData,
					});

					console.log('其他玩家创建完成:', {
						playerId: playerData.playerId,
						sprite: otherPlayer,
						nameText: nameText,
					});
				}
			});
		}

		// 如果当前玩家没有被创建（房间数据有问题或找不到匹配的玩家），创建一个默认的当前玩家
		if (!currentPlayerCreated) {
			console.warn('⚠️ 当前玩家未在房间数据中找到，创建默认玩家');

			// 创建默认的当前玩家
			this.player = this.physics.add.sprite(100, 300, 'edward');
			this.player.setCollideWorldBounds(true);
			this.player.setDepth(10);
			this.player.setSize(24, 32);
			this.player.setData('playerId', this.currentPlayerId || 'default_player');
			this.player.setData('playerType', 'male');

			console.log('默认当前玩家创建完成:', this.player);
		}

		// 确保 this.player 存在
		if (!this.player) {
			console.error('❌ 严重错误：当前玩家创建失败，回退到单人模式');
			this.gameMode = 'single';
			this.initSinglePlayerGame();
			return;
		}

		console.log('多人游戏初始化完成:', {
			player: this.player,
			playerId: this.player.getData('playerId'),
			playerType: this.player.getData('playerType'),
			otherPlayers: this.otherPlayers.size,
		});

		// 监听多人游戏事件
		this.setupMultiplayerListeners();

		// 开始同步
		this.startMultiplayerSync();
	}

	setupMultiplayerListeners() {
		console.log('🎯 设置多人游戏事件监听器');

		// 监听房间状态更新
		multiplayerManager.on('roomUpdated', (roomData) => {
			console.log('🏠 收到房间状态更新:', roomData);
			this.updateOtherPlayers(roomData);
		});

		// 监听游戏状态更新
		multiplayerManager.on('gameStateUpdated', (gameState) => {
			console.log('🎮 收到游戏状态更新:', gameState);
			this.updateGameStateFromServer(gameState);
		});
	}

	startMultiplayerSync() {
		// 每200ms同步一次玩家位置（降低频率避免登录循环）
		this.syncTimer = this.time.addEvent({
			delay: 200,
			callback: this.syncPlayerPosition,
			callbackScope: this,
			loop: true,
		});

		// 添加同步状态标志
		this.isSyncingPosition = false;

		console.log('🔄 开始多人游戏位置同步');
	}

	syncPlayerPosition() {
		if (
			this.player &&
			this.gameMode === 'multiplayer' &&
			!this.isSyncingPosition
		) {
			const currentPosition = {
				x: Math.round(this.player.x),
				y: Math.round(this.player.y),
			};

			// 获取当前手持物品信息
			const currentHolding = this.playerHolding
				? {
						type: this.playerHolding.type,
						contents: this.playerHolding.contents || null,
				  }
				: null;

			// 检查位置或手持物品是否发生变化
			const positionChanged =
				!this.lastSyncPosition ||
				Math.abs(this.lastSyncPosition.x - currentPosition.x) > 5 ||
				Math.abs(this.lastSyncPosition.y - currentPosition.y) > 5;

			const holdingChanged =
				JSON.stringify(this.lastSyncHolding) !== JSON.stringify(currentHolding);

			// 只有位置或手持物品发生明显变化时才同步
			if (positionChanged || holdingChanged) {
				this.lastSyncPosition = { ...currentPosition };
				this.lastSyncHolding = currentHolding ? { ...currentHolding } : null;
				this.isSyncingPosition = true;

				console.log('🚀 发送玩家状态同步:', {
					playerId: this.currentPlayerId,
					position: currentPosition,
					holding: currentHolding,
					positionChanged,
					holdingChanged,
					roomId: multiplayerManager.roomId,
				});

				// 异步同步，不阻塞游戏
				multiplayerManager
					.syncPlayerAction('move', {
						position: currentPosition,
						holding: currentHolding, // 添加手持物品信息
					})
					.then((result) => {
						if (result && result.result && result.result.success) {
							console.log('✅ 玩家状态同步成功:', {
								position: currentPosition,
								holding: currentHolding,
								playerId: this.currentPlayerId,
								result: result.result,
							});
						} else {
							console.error('❌ 玩家状态同步失败:', {
								position: currentPosition,
								holding: currentHolding,
								playerId: this.currentPlayerId,
								result: result,
							});
						}
					})
					.catch((error) => {
						console.error('💥 玩家状态同步出错:', {
							position: currentPosition,
							holding: currentHolding,
							playerId: this.currentPlayerId,
							error: error.message,
							stack: error.stack,
						});
					})
					.finally(() => {
						this.isSyncingPosition = false;
					});
			}
		} else {
			// 添加调试信息，了解为什么没有同步
			if (this.gameMode === 'multiplayer' && Math.random() < 0.1) {
				// 10%概率打印
				console.log('🔍 玩家状态同步跳过:', {
					hasPlayer: !!this.player,
					gameMode: this.gameMode,
					isSyncingPosition: this.isSyncingPosition,
					currentPosition: this.player
						? { x: this.player.x, y: this.player.y }
						: null,
					currentHolding: this.playerHolding,
					lastSyncPosition: this.lastSyncPosition,
					lastSyncHolding: this.lastSyncHolding,
				});
			}
		}
	}

	updateOtherPlayers(roomData) {
		if (!roomData || !roomData.players) {
			console.log('⚠️ 房间数据无效，跳过更新');
			return;
		}

		console.log('👥 更新其他玩家:', {
			totalPlayers: roomData.players.length,
			currentPlayerId: this.currentPlayerId,
			players: roomData.players.map((p) => ({
				id: p.playerId,
				nickname: p.nickname,
				position: p.position,
				holding: p.holding, // 添加手持物品信息
			})),
		});

		// 处理每个玩家
		roomData.players.forEach((playerData, index) => {
			if (playerData.playerId !== this.currentPlayerId) {
				const otherPlayer = this.otherPlayers.get(playerData.playerId);

				if (otherPlayer && playerData.position) {
					// 更新现有玩家位置
					otherPlayer.sprite.setPosition(
						playerData.position.x,
						playerData.position.y
					);
					otherPlayer.nameText.setPosition(
						playerData.position.x,
						playerData.position.y - 40
					);

					// 更新手持物品位置（如果存在）
					if (otherPlayer.holdingSprite) {
						otherPlayer.holdingSprite.setPosition(
							playerData.position.x + 20,
							playerData.position.y - 10
						);
					}

					// 更新玩家数据
					otherPlayer.data = playerData;

					// 更新手持物品显示
					this.updateOtherPlayerHolding(otherPlayer, playerData.holding);

					console.log('📍 更新玩家状态:', {
						playerId: playerData.playerId,
						nickname: playerData.nickname,
						position: playerData.position,
						holding: playerData.holding,
					});
				} else if (!otherPlayer) {
					// 如果其他玩家不存在，创建它
					console.log('➕ 发现新玩家，创建角色:', playerData);
					this.createOtherPlayer(playerData, index);
				}
			} else {
				// 更新当前玩家的服务器端数据（但不改变位置，因为位置由本地控制）
				console.log('🎯 当前玩家数据:', {
					playerId: playerData.playerId,
					nickname: playerData.nickname,
					serverPosition: playerData.position,
					serverHolding: playerData.holding,
					localPosition: this.player
						? { x: this.player.x, y: this.player.y }
						: null,
					localHolding: this.playerHolding,
				});
			}
		});

		// 检查是否有玩家离开了房间
		this.otherPlayers.forEach((otherPlayer, playerId) => {
			const stillInRoom = roomData.players.some((p) => p.playerId === playerId);
			if (!stillInRoom) {
				console.log('➖ 玩家离开房间，移除角色:', playerId);
				otherPlayer.sprite.destroy();
				otherPlayer.nameText.destroy();
				// 清理手持物品显示
				if (otherPlayer.holdingSprite) {
					otherPlayer.holdingSprite.destroy();
				}
				this.otherPlayers.delete(playerId);
			}
		});
	}

	// 更新其他玩家的手持物品显示
	updateOtherPlayerHolding(otherPlayer, holdingData) {
		// 检查otherPlayer是否存在
		if (!otherPlayer || !otherPlayer.sprite) {
			console.warn('⚠️ otherPlayer或其sprite不存在，跳过手持物品更新');
			return;
		}

		// 检查场景是否已初始化
		if (!this.add || !this.tweens) {
			console.warn('⚠️ 场景未完全初始化，跳过手持物品更新');
			return;
		}

		// 清除之前的手持物品显示
		if (otherPlayer.holdingSprite) {
			otherPlayer.holdingSprite.destroy();
			otherPlayer.holdingSprite = null;
		}

		// 如果玩家手持物品，在角色旁边显示
		if (holdingData && holdingData.type) {
			try {
				otherPlayer.holdingSprite = this.add.sprite(
					otherPlayer.sprite.x + 20,
					otherPlayer.sprite.y - 10,
					holdingData.type
				);
				otherPlayer.holdingSprite.setScale(0.6);
				otherPlayer.holdingSprite.setDepth(15);

				// 添加轻微的浮动动画
				this.tweens.add({
					targets: otherPlayer.holdingSprite,
					y: otherPlayer.sprite.y - 15,
					duration: 1000,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.easeInOut',
				});

				console.log('🎒 更新其他玩家手持物品:', {
					playerId: otherPlayer.data?.playerId,
					holding: holdingData,
				});
			} catch (error) {
				console.error('❌ 创建其他玩家手持物品精灵失败:', {
					error: error.message,
					holdingData,
					playerId: otherPlayer.data?.playerId,
					sceneState: {
						hasAdd: !!this.add,
						hasTweens: !!this.tweens,
						sceneActive: this.scene?.isActive(),
					},
				});
			}
		}
	}

	createOtherPlayer(playerData, playerIndex) {
		// 为不同玩家分配不同角色
		const characterTypes = ['edward', 'abby'];
		const characterType = characterTypes[playerIndex % characterTypes.length];

		const otherPlayer = this.physics.add.sprite(
			playerData.x || 150,
			playerData.y || 300,
			characterType
		);

		otherPlayer.setCollideWorldBounds(true);
		otherPlayer.setSize(24, 24);
		otherPlayer.setOffset(4, 8);
		otherPlayer.setDepth(10);
		otherPlayer.setTint(0xaaaaff); // 稍微不同的颜色区分其他玩家
		otherPlayer.playerId = playerData.playerId;
		otherPlayer.characterType = characterType;
		otherPlayer.direction = playerData.direction || 'down';

		// 播放初始动画
		otherPlayer.anims.play(`${characterType}_idle_${otherPlayer.direction}`);

		// 创建玩家名称标签
		const nameText = this.add.text(
			otherPlayer.x,
			otherPlayer.y - 40,
			`玩家${playerIndex + 2}`,
			{
				fontSize: '12px',
				fill: '#ffffff',
				backgroundColor: '#000000',
				padding: { x: 4, y: 2 },
			}
		);
		nameText.setOrigin(0.5);
		nameText.setDepth(15);
		otherPlayer.nameText = nameText;

		// 创建手持物品精灵
		const holdingSprite = this.add.sprite(
			otherPlayer.x,
			otherPlayer.y,
			'tomato'
		);
		holdingSprite.setVisible(false);
		holdingSprite.setDepth(12);
		holdingSprite.setScale(0.6);
		otherPlayer.holdingSprite = holdingSprite;

		this.otherPlayers.push(otherPlayer);

		console.log(`👥 创建其他玩家 ${playerIndex + 2}:`, {
			playerId: playerData.playerId,
			characterType: characterType,
			position: { x: playerData.x, y: playerData.y },
			direction: otherPlayer.direction,
		});

		return otherPlayer;
	}

	updateGameStateFromServer(gameState) {
		console.log('🔄 从服务器更新游戏状态:', gameState);

		// 更新基本游戏状态
		if (gameState.currentOrder) {
			this.currentOrder = gameState.currentOrder;
		}
		if (gameState.score !== undefined) {
			this.score = gameState.score;
		}
		if (gameState.timeLeft !== undefined) {
			this.timeLeft = gameState.timeLeft;
		}
		if (gameState.completedOrders !== undefined) {
			this.completedOrders = gameState.completedOrders;
		}

		// 同步工作台状态
		if (gameState.stations) {
			console.log('🔧 同步工作台状态:', gameState.stations);
			this.updateStationsFromServer(gameState.stations);
		}

		// 同步盘子状态
		if (gameState.plates) {
			console.log('🍽️ 同步盘子状态:', gameState.plates);
			this.updatePlatesFromServer(gameState.plates);
		}

		// 同步洗碗槽状态
		if (gameState.washStations) {
			console.log('🚿 同步洗碗槽状态:', gameState.washStations);
			this.updateWashStationsFromServer(gameState.washStations);
		}

		// 同步地面物品
		if (gameState.groundItems) {
			console.log('📦 同步地面物品:', gameState.groundItems);
			this.updateGroundItemsFromServer(gameState.groundItems);
		}

		// 同步灭火器状态
		if (gameState.extinguisher) {
			console.log('🧯 同步灭火器状态:', gameState.extinguisher);
			this.updateExtinguisherFromServer(gameState.extinguisher);
		}
	}

	// 从服务器更新工作台状态
	updateStationsFromServer(serverStations) {
		// 安全检查：确保stations对象已经初始化
		if (!this.stations || !this.stations.children) {
			console.warn('⚠️ stations对象未初始化，跳过更新:', {
				stationsExists: !!this.stations,
				childrenExists: this.stations ? !!this.stations.children : false,
			});
			return;
		}

		Object.keys(serverStations).forEach((stationId) => {
			const serverStationData = serverStations[stationId];
			console.log('🔧 处理工作台（对象）:', { stationId, serverStationData });

			// 通过位置查找对应的本地工作台
			const localStation = this.findStationByPosition(
				serverStationData.position
			);
			if (localStation) {
				console.log('🔧 找到本地工作台，更新状态:', {
					stationId,
					localPosition: { x: localStation.x, y: localStation.y },
					serverData: serverStationData,
				});

				// 更新工作台状态
				localStation.setData(
					'isProcessing',
					serverStationData.isProcessing || false
				);
				localStation.setData(
					'processedItem',
					serverStationData.processedItem || null
				);
				localStation.setData(
					'processingItem',
					serverStationData.processingItem || null
				);
				localStation.setData('isOnFire', serverStationData.isOnFire || false);
				localStation.setData('contents', serverStationData.contents || []);
				localStation.setData(
					'currentUser',
					serverStationData.currentUser || null
				);

				// 如果工作台着火，更新纹理
				if (
					serverStationData.isOnFire &&
					serverStationData.stationType === 'cooking'
				) {
					localStation.setTexture('fire_cooking_station');
				} else if (serverStationData.stationType === 'cooking') {
					localStation.setTexture('cooking_station');
				}

				// 更新ID映射
				this.stationIdMap.set(localStation, stationId);

				console.log('✅ 工作台状态更新完成:', {
					stationId,
					updatedLocalData: {
						isProcessing: localStation.getData('isProcessing'),
						processedItem: localStation.getData('processedItem'),
						processingItem: localStation.getData('processingItem'),
						contents: localStation.getData('contents'),
						currentUser: localStation.getData('currentUser'),
					},
				});
			} else {
				console.warn('⚠️ 未找到对应的本地工作台:', {
					stationId,
					serverPosition: serverStationData.position,
					availableStations: this.stations.children.entries.map((s) => ({
						x: s.x,
						y: s.y,
						type: s.getData('type'),
					})),
				});
			}
		});
	}

	// 从服务器更新盘子状态
	updatePlatesFromServer(serverPlates) {
		console.log('🍽️ 开始更新盘子状态，服务器数据:', serverPlates);

		// 安全检查：确保plates对象已经初始化
		if (!this.plates || !this.plates.children) {
			console.warn('⚠️ plates对象未初始化，跳过更新:', {
				platesExists: !!this.plates,
				childrenExists: this.plates ? !!this.plates.children : false,
				serverPlatesType: typeof serverPlates,
				serverPlatesLength: Array.isArray(serverPlates)
					? serverPlates.length
					: Object.keys(serverPlates || {}).length,
			});
			return;
		}

		// 检查serverPlates是数组还是对象
		if (Array.isArray(serverPlates)) {
			// 处理数组结构
			serverPlates.forEach((serverPlateData) => {
				console.log('🍽️ 处理盘子（数组）:', { serverPlateData });

				// 通过ID或位置查找对应的本地盘子
				let localPlate = null;

				// 首先尝试通过ID查找
				if (serverPlateData.id) {
					localPlate = this.plates.children.entries.find(
						(plate) => plate.getData('plateId') === serverPlateData.id
					);
				}

				// 如果通过ID没找到，尝试通过位置查找
				if (
					!localPlate &&
					serverPlateData.x !== undefined &&
					serverPlateData.y !== undefined
				) {
					localPlate = this.findPlateByPosition({
						x: serverPlateData.x,
						y: serverPlateData.y,
					});
				}

				if (localPlate) {
					console.log('🍽️ 找到本地盘子，更新状态:', {
						plateId: serverPlateData.id,
						localPosition: { x: localPlate.x, y: localPlate.y },
						serverData: serverPlateData,
						currentLocalData: {
							contents: localPlate.getData('contents'),
							plateType: localPlate.getData('plateType'),
							visible: localPlate.visible,
							active: localPlate.active,
						},
					});

					// 更新盘子状态
					localPlate.setData('contents', serverPlateData.contents || []);
					localPlate.setData('plateType', serverPlateData.plateType || 'clean');

					// 更新位置（如果服务器有位置信息）
					if (
						serverPlateData.x !== undefined &&
						serverPlateData.y !== undefined
					) {
						localPlate.setPosition(serverPlateData.x, serverPlateData.y);
					}

					// 更新可见性和活跃状态
					if (serverPlateData.visible !== undefined) {
						localPlate.setVisible(serverPlateData.visible);
					}
					if (serverPlateData.active !== undefined) {
						// 特殊处理：如果是脏盘子且可见，确保它是活跃的（可以被交互）
						if (
							serverPlateData.plateType === 'dirty' &&
							serverPlateData.visible
						) {
							localPlate.setActive(true); // 脏盘子必须可交互
							console.log('🍽️ 强制设置脏盘子为活跃状态:', {
								plateId: serverPlateData.id,
								plateType: 'dirty',
								visible: serverPlateData.visible,
								forceActive: true,
							});
						} else {
							localPlate.setActive(serverPlateData.active);
						}
					}

					// 根据盘子类型更新纹理
					const plateType = serverPlateData.plateType || 'clean';
					if (plateType === 'dirty') {
						localPlate.setTexture('dirty_plate');
					} else {
						localPlate.setTexture('plate');
					}

					// 如果服务器有ID，确保本地盘子也有相同的ID
					if (serverPlateData.id) {
						localPlate.setData('plateId', serverPlateData.id);
					}

					console.log('✅ 盘子状态更新完成:', {
						plateId: serverPlateData.id,
						updatedLocalData: {
							contents: localPlate.getData('contents'),
							plateType: localPlate.getData('plateType'),
							position: { x: localPlate.x, y: localPlate.y },
							visible: localPlate.visible,
							active: localPlate.active,
							texture: localPlate.texture.key,
						},
					});
				} else {
					console.warn('⚠️ 未找到对应的本地盘子:', {
						serverPlateData,
						availablePlates: this.plates.children.entries.map((p) => ({
							x: p.x,
							y: p.y,
							plateId: p.getData('plateId'),
							contents: p.getData('contents'),
						})),
					});
				}
			});
		} else {
			// 处理对象结构（保持向后兼容）
			Object.keys(serverPlates).forEach((plateId) => {
				const serverPlateData = serverPlates[plateId];
				console.log('🍽️ 处理盘子（对象）:', { plateId, serverPlateData });

				// 通过位置查找对应的本地盘子
				const localPlate = this.findPlateByPosition(serverPlateData.position);
				if (localPlate) {
					console.log('🍽️ 找到本地盘子，更新状态:', {
						plateId,
						localPosition: { x: localPlate.x, y: localPlate.y },
						serverData: serverPlateData,
					});

					// 更新盘子状态
					localPlate.setData('contents', serverPlateData.contents);
					localPlate.setData('plateType', serverPlateData.plateType);

					// 更新ID映射
					this.plateIdMap.set(localPlate, plateId);
				}
			});
		}
	}

	// 从服务器更新洗碗槽状态
	updateWashStationsFromServer(serverWashStations) {
		// 安全检查：确保washStation对象已经初始化
		if (!this.washStation || !this.washStation.children) {
			console.warn('⚠️ washStation对象未初始化，跳过更新:', {
				washStationExists: !!this.washStation,
				childrenExists: this.washStation ? !!this.washStation.children : false,
			});
			return;
		}

		if (!serverWashStations) {
			console.warn('⚠️ 服务器洗碗槽数据为空，跳过更新');
			return;
		}

		Object.keys(serverWashStations).forEach((washStationId) => {
			const serverWashStationData = serverWashStations[washStationId];

			// 检查服务器数据是否有效
			if (!serverWashStationData) {
				console.warn('⚠️ 洗碗槽数据无效:', {
					washStationId,
					serverWashStationData,
				});
				return;
			}

			// 检查position是否存在
			if (
				!serverWashStationData.position ||
				typeof serverWashStationData.position.x === 'undefined' ||
				typeof serverWashStationData.position.y === 'undefined'
			) {
				console.warn('⚠️ 洗碗槽位置数据无效，跳过查找:', {
					washStationId,
					position: serverWashStationData.position,
				});
				return;
			}

			// 通过位置查找对应的本地洗碗槽
			const localWashStation = this.findWashStationByPosition(
				serverWashStationData.position
			);

			if (localWashStation) {
				console.log('🚿 更新洗碗槽:', {
					washStationId,
					localPosition: { x: localWashStation.x, y: localWashStation.y },
					serverData: serverWashStationData,
				});

				// 更新洗碗槽状态
				localWashStation.setData(
					'isWashing',
					serverWashStationData.isWashing || false
				);
				localWashStation.setData(
					'cleanPlate',
					serverWashStationData.cleanPlate || false
				);

				// 更新ID映射
				this.washStationIdMap.set(localWashStation, washStationId);
			} else {
				console.warn('⚠️ 未找到对应的本地洗碗槽:', {
					washStationId,
					serverPosition: serverWashStationData.position,
					availableWashStations:
						this.washStation?.children?.entries?.map((ws) => ({
							x: ws.x,
							y: ws.y,
							type: ws.getData('type'),
						})) || [],
				});
			}
		});
	}

	// 从服务器更新地面物品状态
	updateGroundItemsFromServer(serverGroundItems) {
		// 安全检查：确保groundItems对象已经初始化
		if (!this.groundItems || !this.groundItems.children) {
			console.warn('⚠️ groundItems对象未初始化，跳过更新:', {
				groundItemsExists: !!this.groundItems,
				childrenExists: this.groundItems ? !!this.groundItems.children : false,
			});
			return;
		}

		if (!serverGroundItems) {
			console.warn('⚠️ 服务器地面物品数据为空，跳过更新');
			return;
		}

		// 清除所有现有的地面物品
		this.groundItems.children.entries.forEach((item) => {
			this.groundItemIdMap.delete(item);
			item.destroy();
		});

		// 根据服务器数据重新创建地面物品
		serverGroundItems.forEach((itemData) => {
			console.log('📦 创建地面物品:', itemData);

			const groundItem = this.groundItems.create(
				itemData.position.x,
				itemData.position.y,
				itemData.type
			);
			groundItem.setData('type', itemData.type);
			groundItem.setData('contents', itemData.contents);
			groundItem.setSize(28, 28);

			// 更新ID映射
			this.groundItemIdMap.set(groundItem, itemData.id);
		});
	}

	// 从服务器更新灭火器状态
	updateExtinguisherFromServer(serverExtinguisher) {
		// 安全检查：确保extinguisher对象已经初始化
		if (!this.extinguisher || !this.extinguisher.children) {
			console.warn('⚠️ extinguisher对象未初始化，跳过更新:', {
				extinguisherExists: !!this.extinguisher,
				childrenExists: this.extinguisher
					? !!this.extinguisher.children
					: false,
			});
			return;
		}

		if (!serverExtinguisher) {
			console.warn('⚠️ 服务器灭火器数据为空，跳过更新');
			return;
		}

		// 获取本地灭火器对象（应该只有一个）
		const localExtinguisher = this.extinguisher.children.entries[0];
		if (!localExtinguisher) {
			console.warn('⚠️ 本地灭火器对象不存在');
			return;
		}

		console.log('🧯 更新本地灭火器状态:', {
			serverState: serverExtinguisher,
			currentPosition: { x: localExtinguisher.x, y: localExtinguisher.y },
			currentVisible: localExtinguisher.visible,
			currentActive: localExtinguisher.active,
		});

		// 更新灭火器位置
		if (serverExtinguisher.position) {
			localExtinguisher.setPosition(
				serverExtinguisher.position.x,
				serverExtinguisher.position.y
			);
		}

		// 更新可见性和活跃状态
		if (serverExtinguisher.visible !== undefined) {
			localExtinguisher.setVisible(serverExtinguisher.visible);
		}
		if (serverExtinguisher.active !== undefined) {
			localExtinguisher.setActive(serverExtinguisher.active);
		}

		// 强制更新物理体位置（确保碰撞检测正确）
		if (localExtinguisher.body) {
			localExtinguisher.body.updateFromGameObject();
		}

		console.log('✅ 灭火器状态更新完成:', {
			newPosition: { x: localExtinguisher.x, y: localExtinguisher.y },
			visible: localExtinguisher.visible,
			active: localExtinguisher.active,
			isHeld: serverExtinguisher.isHeld,
			heldBy: serverExtinguisher.heldBy,
		});
	}

	// 通过位置查找工作台
	findStationByPosition(position) {
		// 参数验证
		if (
			!position ||
			typeof position.x !== 'number' ||
			typeof position.y !== 'number'
		) {
			console.warn('⚠️ findStationByPosition: 无效的position参数:', position);
			return null;
		}

		return this.stations.children.entries.find((station) => {
			const distance = Phaser.Math.Distance.Between(
				station.x,
				station.y,
				position.x,
				position.y
			);
			return distance < 10; // 允许10像素的误差
		});
	}

	// 通过位置查找盘子
	findPlateByPosition(position) {
		// 参数验证
		if (
			!position ||
			typeof position.x !== 'number' ||
			typeof position.y !== 'number'
		) {
			console.warn('⚠️ findPlateByPosition: 无效的position参数:', position);
			return null;
		}

		return this.plates.children.entries.find((plate) => {
			const distance = Phaser.Math.Distance.Between(
				plate.x,
				plate.y,
				position.x,
				position.y
			);
			return distance < 10; // 允许10像素的误差
		});
	}

	// 通过位置查找洗碗槽
	findWashStationByPosition(position) {
		// 参数验证
		if (
			!position ||
			typeof position.x !== 'number' ||
			typeof position.y !== 'number'
		) {
			console.warn(
				'⚠️ findWashStationByPosition: 无效的position参数:',
				position
			);
			return null;
		}

		return this.washStation.children.entries.find((washStation) => {
			const distance = Phaser.Math.Distance.Between(
				washStation.x,
				washStation.y,
				position.x,
				position.y
			);
			return distance < 10; // 允许10像素的误差
		});
	}

	// 生成唯一ID
	generateObjectId() {
		return `obj_${this.objectIdCounter++}_${Date.now()}`;
	}

	// 获取或创建盘子ID
	getPlateId(plate) {
		// 优先使用盘子自身的plateId
		const existingId = plate.getData('plateId');
		if (existingId) {
			return existingId;
		}

		// 如果没有，检查映射表
		if (!this.plateIdMap.has(plate)) {
			this.plateIdMap.set(plate, this.generateObjectId());
		}
		return this.plateIdMap.get(plate);
	}

	// 获取或创建工作台ID
	getStationId(station) {
		if (!this.stationIdMap.has(station)) {
			this.stationIdMap.set(station, this.generateObjectId());
		}
		return this.stationIdMap.get(station);
	}

	// 获取或创建洗碗槽ID
	getWashStationId(washStation) {
		if (!this.washStationIdMap.has(washStation)) {
			this.washStationIdMap.set(washStation, this.generateObjectId());
		}
		return this.washStationIdMap.get(washStation);
	}

	// 获取或创建地面物品ID
	getGroundItemId(groundItem) {
		if (!this.groundItemIdMap.has(groundItem)) {
			this.groundItemIdMap.set(groundItem, this.generateObjectId());
		}
		return this.groundItemIdMap.get(groundItem);
	}

	// 同步盘子状态
	async syncPlateState(plate) {
		if (this.gameMode !== 'multiplayer') return;

		const plateId = this.getPlateId(plate);
		const contents = plate.getData('contents') || [];
		const plateType = plate.getData('plateType') || 'clean';
		const position = { x: plate.x, y: plate.y };
		const visible = plate.visible;
		const active = plate.active;

		try {
			await multiplayerManager.syncPlateState(
				plateId,
				contents,
				plateType,
				position,
				visible,
				active
			);
			console.log('✅ 盘子状态同步成功:', {
				plateId,
				contents,
				plateType,
				position,
				visible,
				active,
			});
		} catch (error) {
			console.error('❌ 盘子状态同步失败:', error);
		}
	}

	// 同步工作台状态
	async syncStationState(station) {
		if (this.gameMode !== 'multiplayer') return;

		const stationId = this.getStationId(station);
		const isProcessing = station.getData('isProcessing') || false;
		const processedItem = station.getData('processedItem') || null;
		const processingItem = station.getData('processingItem') || null;
		const isOnFire = station.getData('isOnFire') || false;
		const contents = station.getData('contents') || [];

		const stationData = {
			isProcessing: isProcessing,
			processedItem: processedItem,
			processingItem: processingItem,
			isOnFire: isOnFire,
			position: { x: station.x, y: station.y },
			stationType: station.getData('type'),
			contents: contents, // 确保包含contents
		};

		try {
			const result = await multiplayerManager.syncStationState(
				stationId,
				stationData
			);
			console.log('✅ 工作台状态同步成功:', {
				stationId,
				stationData,
				result: result?.result,
			});
		} catch (error) {
			console.error('❌ 工作台状态同步失败:', error);
		}
	}

	// 同步洗碗槽状态
	async syncWashStationState(washStation) {
		if (this.gameMode !== 'multiplayer') return;

		const washStationId = this.getWashStationId(washStation);
		const washStationData = {
			isWashing: washStation.getData('isWashing') || false,
			cleanPlate: washStation.getData('cleanPlate') || false,
			position: { x: washStation.x, y: washStation.y },
		};

		try {
			await multiplayerManager.syncWashStationState(
				washStationId,
				washStationData
			);
			console.log('✅ 洗碗槽状态同步成功:', { washStationId, washStationData });
		} catch (error) {
			console.error('❌ 洗碗槽状态同步失败:', error);
		}
	}

	// 同步地面物品添加
	async syncGroundItemAdd(groundItem) {
		if (this.gameMode !== 'multiplayer') return;

		const itemId = this.getGroundItemId(groundItem);
		const itemData = {
			itemId,
			itemType: groundItem.getData('type'),
			contents: groundItem.getData('contents') || null,
			position: { x: groundItem.x, y: groundItem.y },
		};

		try {
			await multiplayerManager.syncGroundItem('add', itemData);
			console.log('✅ 地面物品添加同步成功:', itemData);
		} catch (error) {
			console.error('❌ 地面物品添加同步失败:', error);
		}
	}

	// 同步地面物品移除
	async syncGroundItemRemove(groundItem) {
		if (this.gameMode !== 'multiplayer') return;

		const itemId = this.getGroundItemId(groundItem);

		try {
			await multiplayerManager.syncGroundItem('remove', { itemId });
			console.log('✅ 地面物品移除同步成功:', { itemId });
			// 清理映射
			this.groundItemIdMap.delete(groundItem);
		} catch (error) {
			console.error('❌ 地面物品移除同步失败:', error);
		}
	}

	// 同步灭火器状态
	async syncExtinguisherState(position, isHeld, visible = true, active = true) {
		if (this.gameMode !== 'multiplayer') return;

		const extinguisherData = {
			position: position,
			isHeld: isHeld,
			visible: visible,
			active: active,
		};

		try {
			const result = await multiplayerManager.syncPlayerAction(
				'extinguisherUpdate',
				extinguisherData
			);
			console.log('✅ 灭火器状态同步成功:', {
				extinguisherData,
				result: result?.result,
			});
		} catch (error) {
			console.error('❌ 灭火器状态同步失败:', error);
		}
	}

	startGame() {
		// 重置游戏状态
		this.gameStarted = false;
		this.gameEnded = false;
		this.score = 0;
		this.timeLeft = 180;
		this.completedOrders = 0;
		this.playerHolding = null;
		this.currentOrder = null;

		// 清理之前的计时器
		if (this.gameTimer) {
			this.gameTimer.remove();
			this.gameTimer = null;
		}
		if (this.orderTimer) {
			this.orderTimer.remove();
			this.orderTimer = null;
		}

		// 检查游戏模式
		this.gameMode = this.gameMode || 'single';

		// 初始化多人游戏
		if (this.gameMode === 'multiplayer') {
			this.initMultiplayerGame();
		} else {
			this.initSinglePlayerGame();
		}

		// 生成第一个订单
		this.generateOrder();

		// 开始计时器
		this.startTimer();

		// 开始订单计时器
		this.startOrderTimer();

		this.gameStarted = true;
	}

	createKitchenLayout() {
		// 设置世界边界
		this.physics.world.setBounds(0, 0, 1200, 800);

		// 创建瓦片地板
		const tileSize = 32;
		const floorWidth = Math.ceil(1200 / tileSize);
		const floorHeight = Math.ceil(800 / tileSize);

		// 创建地板瓦片组
		this.floorTiles = this.add.group();

		for (let x = 0; x < floorWidth; x++) {
			for (let y = 0; y < floorHeight; y++) {
				// 厨房区域使用厨房地板
				let floorTexture = 'kitchen_floor';

				// 边缘区域使用走廊地板
				if (x < 2 || x >= floorWidth - 2 || y < 2 || y >= floorHeight - 2) {
					floorTexture = 'corridor_floor';
				}

				const floorTile = this.add.image(
					x * tileSize + tileSize / 2,
					y * tileSize + tileSize / 2,
					floorTexture
				);
				floorTile.setDisplaySize(tileSize, tileSize);
				this.floorTiles.add(floorTile);
			}
		}

		// 创建墙壁
		this.walls = this.physics.add.staticGroup();

		// 顶部墙壁
		for (let x = 0; x < floorWidth; x++) {
			const wall = this.add.image(
				x * tileSize + tileSize / 2,
				tileSize / 2,
				'kitchen_wall'
			);
			wall.setDisplaySize(tileSize, tileSize);
			this.walls.add(wall);
		}

		// 底部墙壁
		for (let x = 0; x < floorWidth; x++) {
			const wall = this.add.image(
				x * tileSize + tileSize / 2,
				(floorHeight - 1) * tileSize + tileSize / 2,
				'kitchen_wall'
			);
			wall.setDisplaySize(tileSize, tileSize);
			this.walls.add(wall);
		}

		// 左侧墙壁
		for (let y = 1; y < floorHeight - 1; y++) {
			const wall = this.add.image(
				tileSize / 2,
				y * tileSize + tileSize / 2,
				'kitchen_wall'
			);
			wall.setDisplaySize(tileSize, tileSize);
			this.walls.add(wall);
		}

		// 右侧墙壁
		for (let y = 1; y < floorHeight - 1; y++) {
			const wall = this.add.image(
				(floorWidth - 1) * tileSize + tileSize / 2,
				y * tileSize + tileSize / 2,
				'kitchen_wall'
			);
			wall.setDisplaySize(tileSize, tileSize);
			this.walls.add(wall);
		}

		// 添加一些装饰墙壁
		const decorativeWall1 = this.add.image(200, 150, 'decorative_wall');
		decorativeWall1.setDisplaySize(tileSize * 3, tileSize);
		this.walls.add(decorativeWall1);

		const decorativeWall2 = this.add.image(1000, 150, 'decorative_wall');
		decorativeWall2.setDisplaySize(tileSize * 3, tileSize);
		this.walls.add(decorativeWall2);
	}

	setupControls() {
		this.cursors = this.input.keyboard.createCursorKeys();
		this.wasdKeys = this.input.keyboard.addKeys('W,S,A,D');
		this.spaceKey = this.input.keyboard.addKey(
			Phaser.Input.Keyboard.KeyCodes.SPACE
		);
		this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
		this.qKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
	}

	createGameObjects() {
		// 创建其他玩家数组（多人游戏用）
		this.otherPlayers = [];

		// 创建食材
		this.createIngredients();

		// 创建工作台
		this.createStations();

		// 创建盘子
		this.createPlates();

		// 创建垃圾桶 - 使用新纹理
		this.trash = this.physics.add.staticSprite(700, 500, 'new_trash');
		this.trash.setSize(30, 30);
		this.trash.setDepth(5);

		// 创建灭火器 - 使用新纹理
		this.extinguisher = this.physics.add.sprite(750, 200, 'new_extinguisher');
		this.extinguisher.setSize(24, 24);
		this.extinguisher.setDepth(5);
		this.extinguisher.isHeld = false;
		this.extinguisher.visible = true;
		this.extinguisher.active = true;

		// 创建地面物品组
		this.groundItems = this.physics.add.group();

		// 创建洗碗站
		this.washStations = this.physics.add.staticGroup();
		const washStation = this.physics.add.staticSprite(
			500,
			200,
			'new_wash_station'
		);
		washStation.setSize(60, 30);
		washStation.setDepth(5);
		washStation.isWashing = false;
		washStation.washProgress = 0;
		washStation.dirtyPlate = null;
		this.washStations.add(washStation);
	}

	createIngredients() {
		// 创建食材组
		this.ingredients = this.physics.add.staticGroup();

		// 食材储存区
		const ingredientPositions = [
			{ x: 150, y: 120, type: 'tomato' },
			{ x: 200, y: 120, type: 'tomato' },
			{ x: 250, y: 120, type: 'lettuce' },
			{ x: 300, y: 120, type: 'lettuce' },
			{ x: 350, y: 120, type: 'bread' },
			{ x: 400, y: 120, type: 'bread' },
			// 第二排
			{ x: 150, y: 170, type: 'tomato' },
			{ x: 200, y: 170, type: 'tomato' },
			{ x: 250, y: 170, type: 'lettuce' },
			{ x: 300, y: 170, type: 'lettuce' },
			{ x: 350, y: 170, type: 'bread' },
			{ x: 400, y: 170, type: 'bread' },
		];

		ingredientPositions.forEach((pos) => {
			const ingredient = this.ingredients.create(pos.x, pos.y, pos.type);
			ingredient.setData('type', pos.type);
			ingredient.setData('originalType', pos.type);
			ingredient.setSize(28, 28);
		});
	}

	createStations() {
		// 创建工作台组
		this.stations = this.physics.add.staticGroup();

		console.log('🔧 开始创建工作台...');

		// 检查纹理是否存在，如果不存在则使用回退纹理
		const cuttingTexture = this.textures.exists('new_cutting_station')
			? 'new_cutting_station'
			: 'cutting_station';
		const cookingTexture = this.textures.exists('new_cooking_station')
			? 'new_cooking_station'
			: 'cooking_station';
		const servingTexture = this.textures.exists('new_serving_station')
			? 'new_serving_station'
			: 'serving_station';

		console.log('🔍 纹理检查结果:', {
			cutting: this.textures.exists('new_cutting_station'),
			cooking: this.textures.exists('new_cooking_station'),
			serving: this.textures.exists('new_serving_station'),
			usingTextures: { cuttingTexture, cookingTexture, servingTexture },
		});

		// 切菜台 - 使用新纹理或回退纹理
		const cuttingStation1 = this.physics.add.staticSprite(
			200,
			300,
			cuttingTexture
		);
		cuttingStation1.setSize(60, 30);
		cuttingStation1.setDepth(15); // 增加深度
		cuttingStation1.setVisible(true); // 确保可见
		cuttingStation1.stationType = 'cutting';
		cuttingStation1.contents = [];
		cuttingStation1.isProcessing = false;
		this.stations.add(cuttingStation1);
		console.log('🔪 创建切菜台1:', {
			x: cuttingStation1.x,
			y: cuttingStation1.y,
			texture: cuttingStation1.texture.key,
			visible: cuttingStation1.visible,
			depth: cuttingStation1.depth,
			alpha: cuttingStation1.alpha,
		});

		const cuttingStation2 = this.physics.add.staticSprite(
			350,
			300,
			cuttingTexture
		);
		cuttingStation2.setSize(60, 30);
		cuttingStation2.setDepth(15); // 增加深度
		cuttingStation2.setVisible(true); // 确保可见
		cuttingStation2.stationType = 'cutting';
		cuttingStation2.contents = [];
		cuttingStation2.isProcessing = false;
		this.stations.add(cuttingStation2);
		console.log('🔪 创建切菜台2:', {
			x: cuttingStation2.x,
			y: cuttingStation2.y,
			texture: cuttingStation2.texture.key,
			visible: cuttingStation2.visible,
			depth: cuttingStation2.depth,
			alpha: cuttingStation2.alpha,
		});

		// 烹饪台 - 使用新纹理或回退纹理
		const cookingStation1 = this.physics.add.staticSprite(
			200,
			450,
			cookingTexture
		);
		cookingStation1.setSize(60, 30);
		cookingStation1.setDepth(15); // 增加深度
		cookingStation1.setVisible(true); // 确保可见
		cookingStation1.stationType = 'cooking';
		cookingStation1.contents = [];
		cookingStation1.isProcessing = false;
		cookingStation1.isOnFire = false;
		cookingStation1.fireCountdown = null;
		this.stations.add(cookingStation1);
		console.log('🔥 创建烹饪台1:', {
			x: cookingStation1.x,
			y: cookingStation1.y,
			texture: cookingStation1.texture.key,
			visible: cookingStation1.visible,
			depth: cookingStation1.depth,
			alpha: cookingStation1.alpha,
		});

		const cookingStation2 = this.physics.add.staticSprite(
			350,
			450,
			cookingTexture
		);
		cookingStation2.setSize(60, 30);
		cookingStation2.setDepth(15); // 增加深度
		cookingStation2.setVisible(true); // 确保可见
		cookingStation2.stationType = 'cooking';
		cookingStation2.contents = [];
		cookingStation2.isProcessing = false;
		cookingStation2.isOnFire = false;
		cookingStation2.fireCountdown = null;
		this.stations.add(cookingStation2);
		console.log('🔥 创建烹饪台2:', {
			x: cookingStation2.x,
			y: cookingStation2.y,
			texture: cookingStation2.texture.key,
			visible: cookingStation2.visible,
			depth: cookingStation2.depth,
			alpha: cookingStation2.alpha,
		});

		// 出餐台 - 使用新纹理或回退纹理
		const servingStation = this.physics.add.staticSprite(
			600,
			300,
			servingTexture
		);
		servingStation.setSize(60, 30);
		servingStation.setDepth(15); // 增加深度
		servingStation.setVisible(true); // 确保可见
		servingStation.stationType = 'serving';
		servingStation.contents = [];
		servingStation.isProcessing = false;
		this.stations.add(servingStation);
		console.log('🍽️ 创建出餐台:', {
			x: servingStation.x,
			y: servingStation.y,
			texture: servingStation.texture.key,
			visible: servingStation.visible,
			depth: servingStation.depth,
			alpha: servingStation.alpha,
		});

		console.log('✅ 工作台创建完成，总数:', this.stations.children.size);
	}

	createPlates() {
		// 创建盘子组
		this.plates = this.physics.add.staticGroup();

		// 清空盘子池
		this.platePool = [];

		// 盘子区域 - 固定4个位置
		const platePositions = [
			{ x: 350, y: 420 },
			{ x: 400, y: 420 },
			{ x: 450, y: 420 },
			{ x: 500, y: 420 },
		];

		platePositions.forEach((pos, index) => {
			// 检查是否有新的盘子纹理，如果有就使用，否则使用原来的
			const plateTexture = this.textures.exists('new_plate')
				? 'new_plate'
				: 'plate';

			const plate = this.plates.create(pos.x, pos.y, plateTexture);
			plate.setData('contents', []);
			plate.setData('plateType', 'clean'); // 设置为干净盘子
			plate.setData('originalPosition', { x: pos.x, y: pos.y }); // 记录原始位置
			plate.setSize(28, 28);

			// 为每个盘子分配唯一且固定的ID
			const plateId = `plate_${index}`;
			plate.setData('plateId', plateId);

			// 加入盘子池
			this.platePool.push(plate);

			console.log('🍽️ 创建盘子:', {
				plateId,
				position: pos,
				plateType: 'clean',
				texture: plateTexture,
				poolSize: this.platePool.length,
			});

			// 在多人游戏模式下，初始化盘子状态到服务器
			if (this.gameMode === 'multiplayer') {
				// 延迟同步，确保游戏完全初始化后再同步
				this.time.delayedCall(1000, () => {
					this.syncPlateState(plate);
				});
			}
		});

		console.log('🍽️ 盘子池初始化完成:', {
			totalPlates: this.platePool.length,
			maxPlates: this.maxPlates,
		});
	}

	setupCollisions() {
		// 玩家与墙壁碰撞
		if (this.walls) {
			// 只有在玩家存在时才设置碰撞
			if (this.player) {
				this.physics.add.collider(this.player, this.walls);
			}
		}

		// 设置重叠检测 - 只有在玩家存在时才设置
		if (this.player) {
			this.physics.add.overlap(
				this.player,
				this.ingredients,
				this.handleIngredientInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.stations,
				this.handleStationInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.plates,
				this.handlePlateInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.washStations,
				this.handleWashStationInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.trash,
				this.handleTrashInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.groundItems,
				this.handleGroundItemInteraction,
				null,
				this
			);
			this.physics.add.overlap(
				this.player,
				this.extinguisher,
				this.handleExtinguisherInteraction,
				null,
				this
			);
		} else {
			console.log('⚠️ 玩家尚未创建，跳过碰撞检测设置');
		}
	}

	setupParticleEffects() {
		// 创建粒子效果
		this.cookingParticles = this.add.particles(0, 0, 'particle', {
			scale: { start: 0.5, end: 0 },
			speed: { min: 20, max: 40 },
			lifespan: 1000,
			quantity: 2,
			emitting: false,
		});
	}

	createUI() {
		// 创建UI背景 - 只保留底部操作提示区域
		const uiBackground = this.add.graphics();
		uiBackground.fillStyle(0x000000, 0.7);
		uiBackground.fillRect(0, 520, 800, 80); // 底部
		uiBackground.setDepth(100);

		// 操作提示
		this.controlsText = this.add
			.text(
				10,
				550,
				'WASD: 移动 | 空格: 放置/取出物品/出餐 | E: 拾取/放下盘子/使用工作台/洗碗 | Q: 放置到地面',
				{
					fontSize: '14px',
					fill: '#FFFFFF',
					fontFamily: 'Arial',
					stroke: '#000000',
					strokeThickness: 2,
				}
			)
			.setDepth(100);
	}

	generateOrder() {
		if (this.gameEnded) return;

		const recipeKeys = Object.keys(this.recipes);
		const randomRecipe =
			recipeKeys[Math.floor(Math.random() * recipeKeys.length)];
		this.currentOrder = {
			...this.recipes[randomRecipe],
			id: randomRecipe,
			timeRemaining: this.recipes[randomRecipe].time,
		};

		// 开始订单倒计时
		this.startOrderTimer();

		// 发送游戏状态更新事件
		this.emitGameStateUpdate();
	}

	getRecipeSteps(recipeId) {
		const steps = {
			simple_salad:
				'1.拿取生菜 → 2.切菜台切菜 → 3.装盘 → 4.拿起盘子 → 5.送到出餐口',
			tomato_salad:
				'1.拿取番茄和生菜 → 2.分别在切菜台切菜 → 3.装盘 → 4.拿起盘子 → 5.送到出餐口',
			sandwich:
				'1.拿取番茄切菜并烹饪 → 2.拿取生菜切菜 → 3.拿取面包 → 4.装盘 → 5.拿起盘子 → 6.送到出餐口',
			cooked_meal:
				'1.拿取番茄切菜并烹饪 → 2.拿取生菜切菜并烹饪 → 3.拿取面包 → 4.装盘 → 5.拿起盘子 → 6.送到出餐口',
		};
		return steps[recipeId];
	}

	startOrderTimer() {
		if (this.orderTimer) {
			this.orderTimer.remove();
		}

		this.orderTimer = this.time.addEvent({
			delay: 1000,
			callback: () => {
				if (this.gameEnded) return;

				this.currentOrder.timeRemaining--;

				// 发送游戏状态更新事件
				this.emitGameStateUpdate();

				if (this.currentOrder.timeRemaining <= 0) {
					this.showMessage('订单超时！', 0xff6b6b);
					this.generateOrder();
				}
			},
			loop: true,
		});
	}

	startTimer() {
		this.gameTimer = this.time.addEvent({
			delay: 1000,
			callback: this.updateTimer,
			callbackScope: this,
			loop: true,
		});
	}

	updateTimer() {
		if (this.gameEnded) return;

		this.timeLeft--;

		// 发送游戏状态更新事件
		this.emitGameStateUpdate();

		if (this.timeLeft <= 0) {
			this.gameOver();
		}
	}

	update() {
		if (this.gameEnded) return;

		this.handlePlayerMovement();
		this.updateUI();
		this.handleInteractionHighlight();
		this.updateVisualFeedback();
		this.handleGroundPlacement(); // 添加地面放置处理
	}

	updateVisualFeedback() {
		// 更新角色手持物品显示
		this.updatePlayerHoldingSprite();

		// 更新盘子内容显示
		this.updatePlateContentsSprites();

		// 更新工作台状态显示
		this.updateStationContentsSprites();
	}

	updatePlayerHoldingSprite() {
		// 清除之前的手持物品显示
		if (this.playerHoldingSprite) {
			this.playerHoldingSprite.destroy();
			this.playerHoldingSprite = null;
		}

		// 如果玩家手持物品，在角色旁边显示
		if (this.playerHolding) {
			this.playerHoldingSprite = this.add.sprite(
				this.player.x + 20,
				this.player.y - 10,
				this.playerHolding.type
			);
			this.playerHoldingSprite.setScale(0.6);
			this.playerHoldingSprite.setDepth(15);

			// 添加轻微的浮动动画
			this.tweens.add({
				targets: this.playerHoldingSprite,
				y: this.player.y - 15,
				duration: 1000,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut',
			});
		}
	}

	updatePlateContentsSprites() {
		// 清除之前的盘子内容显示
		this.plateContentsSprites.forEach((sprite) => sprite.destroy());
		this.plateContentsSprites = [];

		// 为每个盘子显示内容
		this.plates.children.entries.forEach((plate) => {
			const contents = plate.getData('contents') || [];
			contents.forEach((itemType, index) => {
				const sprite = this.add.sprite(
					plate.x + index * 8 - 12,
					plate.y - 8,
					itemType
				);
				sprite.setScale(0.4);
				sprite.setDepth(5);
				this.plateContentsSprites.push(sprite);
			});
		});
	}

	updateStationContentsSprites() {
		// 清除之前的工作台内容显示
		this.stationContentsSprites.forEach((sprite) => sprite.destroy());
		this.stationContentsSprites = [];

		// 为每个工作台显示状态
		this.stations.children.entries.forEach((station) => {
			const isProcessing = station.getData('isProcessing');
			const processedItem = station.getData('processedItem');
			const processingItem = station.getData('processingItem');

			if (isProcessing && processingItem) {
				// 显示正在处理的物品
				const sprite = this.add.sprite(
					station.x,
					station.y - 20,
					processingItem.type
				);
				sprite.setScale(0.5);
				sprite.setDepth(6);
				sprite.setAlpha(0.7);
				this.stationContentsSprites.push(sprite);

				// 添加处理中的旋转动画
				this.tweens.add({
					targets: sprite,
					rotation: Math.PI * 2,
					duration: 2000,
					repeat: -1,
					ease: 'Linear',
				});
			} else if (processedItem && processedItem.ready) {
				// 显示处理完成的物品
				const sprite = this.add.sprite(
					station.x,
					station.y - 20,
					processedItem.type
				);
				sprite.setScale(0.6);
				sprite.setDepth(6);
				this.stationContentsSprites.push(sprite);

				// 添加完成的闪烁效果
				this.tweens.add({
					targets: sprite,
					alpha: 0.5,
					duration: 500,
					yoyo: true,
					repeat: -1,
					ease: 'Sine.easeInOut',
				});
			}
		});
	}

	handlePlayerMovement() {
		if (!this.player || this.gameEnded) return;

		const cursors = this.cursors;
		const speed = 160;
		let isMoving = false;
		let newDirection = this.player.direction;

		// 重置速度
		this.player.setVelocity(0);

		// 处理移动输入
		if (cursors.left.isDown) {
			this.player.setVelocityX(-speed);
			newDirection = 'left';
			isMoving = true;
		} else if (cursors.right.isDown) {
			this.player.setVelocityX(speed);
			newDirection = 'right';
			isMoving = true;
		}

		if (cursors.up.isDown) {
			this.player.setVelocityY(-speed);
			newDirection = 'up';
			isMoving = true;
		} else if (cursors.down.isDown) {
			this.player.setVelocityY(speed);
			newDirection = 'down';
			isMoving = true;
		}

		// 更新角色方向
		if (newDirection !== this.player.direction) {
			this.player.direction = newDirection;
		}

		// 播放相应的动画
		const characterType = this.player.characterType || 'edward';
		if (isMoving) {
			this.player.anims.play(`${characterType}_walk_${newDirection}`, true);
		} else {
			this.player.anims.play(`${characterType}_idle_${newDirection}`, true);
		}

		// 多人游戏同步位置
		if (this.gameMode === 'multiplayer') {
			this.syncPlayerPosition();
		}
	}

	updateUI() {
		// 发送游戏状态更新事件
		this.emitGameStateUpdate();
	}

	getItemDisplayName(type) {
		const displayNames = {
			tomato: '番茄',
			lettuce: '生菜',
			bread: '面包',
			chopped_tomato: '切好的番茄',
			chopped_lettuce: '切好的生菜',
			cooked_tomato: '烹饪番茄',
			cooked_lettuce: '烹饪生菜',
			burnt_tomato: '烤糊的番茄',
			burnt_lettuce: '烤糊的生菜',
			prepared_plate: '装好的盘子',
			plate: '干净盘子',
			dirty_plate: '脏盘子',
			extinguisher: '灭火器',
		};
		return displayNames[type] || type;
	}

	handleInteractionHighlight() {
		// 清除之前的高亮
		this.clearHighlights();

		// 检查附近可交互的对象
		const nearbyObjects = this.getNearbyInteractableObjects();
		nearbyObjects.forEach((obj) => {
			obj.setTint(0xffff00); // 黄色高亮
		});
	}

	clearHighlights() {
		// 清除所有高亮效果
		this.ingredients.children.entries.forEach((item) => item.clearTint());
		this.stations.children.entries.forEach((station) => station.clearTint());
		this.plates.children.entries.forEach((plate) => plate.clearTint());
		this.washStations.children.entries.forEach((washStation) =>
			washStation.clearTint()
		);
		this.trash.clearTint();
		this.groundItems.children.entries.forEach((groundItem) =>
			groundItem.clearTint()
		);
		if (this.extinguisher) {
			this.extinguisher.clearTint();
		}
	}

	getNearbyInteractableObjects() {
		// 确保玩家对象存在
		if (!this.player) {
			console.warn('⚠️ 玩家对象不存在，返回空的交互对象列表');
			return [];
		}

		const nearby = [];
		const playerX = this.player.x;
		const playerY = this.player.y;
		const distance = this.gameConfig.interactionDistance;
		// 检查食材
		this.ingredients.children.entries.forEach((item) => {
			if (
				Phaser.Math.Distance.Between(playerX, playerY, item.x, item.y) <
				distance
			) {
				nearby.push(item);
			}
		});

		// 检查工作台
		this.stations.children.entries.forEach((station) => {
			if (
				Phaser.Math.Distance.Between(playerX, playerY, station.x, station.y) <
				distance
			) {
				nearby.push(station);
			}
		});

		// 检查盘子（包括干净盘子和脏盘子）
		this.plates.children.entries.forEach((plate) => {
			// 只检测可见且活跃的盘子
			if (
				plate.active &&
				plate.visible &&
				Phaser.Math.Distance.Between(playerX, playerY, plate.x, plate.y) <
					distance
			) {
				nearby.push(plate);
			}
		});

		// 检查洗碗槽
		this.washStations.children.entries.forEach((washStation) => {
			if (
				Phaser.Math.Distance.Between(
					playerX,
					playerY,
					washStation.x,
					washStation.y
				) < distance
			) {
				nearby.push(washStation);
			}
		});

		// 检查垃圾桶
		if (
			this.trash &&
			Phaser.Math.Distance.Between(
				playerX,
				playerY,
				this.trash.x,
				this.trash.y
			) < distance
		) {
			nearby.push(this.trash);
		}

		// 检查地面物品
		this.groundItems.children.entries.forEach((groundItem) => {
			if (
				Phaser.Math.Distance.Between(
					playerX,
					playerY,
					groundItem.x,
					groundItem.y
				) < distance
			) {
				nearby.push(groundItem);
			}
		});

		// 检查灭火器
		if (
			this.extinguisher &&
			this.extinguisher.active &&
			this.extinguisher.visible &&
			Phaser.Math.Distance.Between(
				playerX,
				playerY,
				this.extinguisher.x,
				this.extinguisher.y
			) < distance
		) {
			nearby.push(this.extinguisher);
		}

		return nearby;
	}

	handleIngredientInteraction(player, ingredient) {
		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			if (!this.playerHolding) {
				// 拾取食材
				this.playerHolding = {
					type: ingredient.getData('type'),
					originalType: ingredient.getData('originalType'),
				};

				// 创建拾取效果
				this.createPickupEffect(ingredient.x, ingredient.y);

				// 重新生成食材
				this.respawnIngredient(ingredient);

				this.showMessage(
					`拾取了 ${this.getItemDisplayName(this.playerHolding.type)}`,
					0x2ed573
				);

				// 发送游戏状态更新事件
				this.emitGameStateUpdate();

				// 多人游戏：立即同步手持物品状态
				if (this.gameMode === 'multiplayer') {
					this.syncPlayerPosition(); // 这会同时同步位置和手持物品
				}
			}
		}
	}

	respawnIngredient(ingredient) {
		const originalType = ingredient.getData('originalType');

		// 延迟重新生成
		this.time.delayedCall(2000, () => {
			ingredient.setTexture(originalType);
			ingredient.setData('type', originalType);
			ingredient.setVisible(true);
			ingredient.setActive(true);
		});

		// 暂时隐藏
		ingredient.setVisible(false);
		ingredient.setActive(false);
	}

	handleStationInteraction(player, station) {
		const stationType = station.getData('type');
		const isProcessing = station.getData('isProcessing');
		const processedItem = station.getData('processedItem');
		const isOnFire = station.getData('isOnFire');

		// 如果烹饪台着火，优先处理灭火
		if (
			isOnFire &&
			this.playerHolding &&
			this.playerHolding.type === 'extinguisher'
		) {
			if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
				this.extinguishFire(station);
				return;
			}
		}

		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			// 空格键：取回完成的物品或在出餐口递交订单
			if (stationType === 'serving') {
				// 出餐口逻辑：需要手持装好的盘子
				this.handleServingStation(station);
				return;
			}

			if (processedItem && processedItem.ready && !this.playerHolding) {
				this.playerHolding = { type: processedItem.type };
				station.setData('processedItem', null);

				// 更新工作台内容 - 移除已取回的物品
				const currentContents = station.getData('contents') || [];
				const itemIndex = currentContents.indexOf(processedItem.type);
				if (itemIndex > -1) {
					currentContents.splice(itemIndex, 1);
					station.setData('contents', currentContents);
				}

				console.log('📦 取回物品，工作台状态:', {
					takenItem: processedItem.type,
					remainingContents: currentContents,
					stationType: station.getData('type'),
				});

				// 清除所有相关计时器（防止取回物品后还有计时器运行）
				const completionTimer = station.getData('completionTimer');
				if (completionTimer) {
					completionTimer.remove();
					station.setData('completionTimer', null);
				}

				const burntTimer = station.getData('burntTimer');
				if (burntTimer) {
					burntTimer.remove();
					station.setData('burntTimer', null);
				}

				const fireTimer = station.getData('fireTimer');
				if (fireTimer) {
					fireTimer.remove();
					station.setData('fireTimer', null);
				}

				// 清除着火倒计时状态和进度条
				station.setData('fireCountdown', false);
				station.setData('fireCountdownStartTime', null);

				const fireCountdownProgressBg = station.getData(
					'fireCountdownProgressBg'
				);
				if (fireCountdownProgressBg) {
					fireCountdownProgressBg.destroy();
					station.setData('fireCountdownProgressBg', null);
				}

				const fireCountdownProgressBar = station.getData(
					'fireCountdownProgressBar'
				);
				if (fireCountdownProgressBar) {
					fireCountdownProgressBar.destroy();
					station.setData('fireCountdownProgressBar', null);
				}

				const fireCountdownProgressTimer = station.getData(
					'fireCountdownProgressTimer'
				);
				if (fireCountdownProgressTimer) {
					fireCountdownProgressTimer.remove();
					station.setData('fireCountdownProgressTimer', null);
				}

				// 清除超时进度条
				const overtimeTimer = station.getData('overtimeTimer');
				if (overtimeTimer) {
					overtimeTimer.remove();
					station.setData('overtimeTimer', null);
				}

				const overtimeBg = station.getData('overtimeBg');
				if (overtimeBg) {
					overtimeBg.destroy();
					station.setData('overtimeBg', null);
				}

				const overtimeBar = station.getData('overtimeBar');
				if (overtimeBar) {
					overtimeBar.destroy();
					station.setData('overtimeBar', null);
				}

				// 检查烹饪台是否还在着火
				const isOnFire = station.getData('isOnFire');

				// 只有在没有着火的情况下才恢复烹饪台纹理
				if (stationType === 'cooking' && !isOnFire) {
					station.setTexture('cooking_station');
				}

				// 特殊处理烤糊食物的提示信息
				if (
					processedItem.type === 'burnt_tomato' ||
					processedItem.type === 'burnt_lettuce'
				) {
					if (isOnFire) {
						this.showMessage(
							`取回了 ${this.getItemDisplayName(
								this.playerHolding.type
							)}，请用灭火器灭火后烹饪台可恢复使用！`,
							0xffa502
						);
					} else {
						this.showMessage(
							`取回了 ${this.getItemDisplayName(
								this.playerHolding.type
							)}，烹饪台已恢复可用！`,
							0x2ed573
						);
					}
				} else {
					this.showMessage(
						`取回了 ${this.getItemDisplayName(this.playerHolding.type)}`,
						0x2ed573
					);
				}

				// 多人游戏：同步工作台状态和手持物品状态
				if (this.gameMode === 'multiplayer') {
					this.syncStationState(station);
					this.syncPlayerPosition(); // 这会同时同步位置和手持物品
				}
				return;
			}
		}

		if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
			// E键：开始加工
			if (stationType === 'serving') {
				this.showMessage(
					'出餐口用于递交完成的订单，请手持装好的盘子并按空格键',
					0xffa502
				);
				return;
			}

			if (isOnFire) {
				if (this.playerHolding && this.playerHolding.type === 'extinguisher') {
					this.showMessage('按E键使用灭火器灭火', 0xffa502);
				} else {
					this.showMessage('烹饪台着火了！需要灭火器灭火！', 0xff6b6b);
				}
				return;
			}

			// 检查是否有烤糊食物（即使没有着火，有烤糊食物也不能使用）
			if (
				processedItem &&
				(processedItem.type === 'burnt_tomato' ||
					processedItem.type === 'burnt_lettuce')
			) {
				this.showMessage('烹饪台有烤糊食物，请先用空格键拾取！', 0xff6b6b);
				return;
			}

			if (isProcessing) {
				this.showMessage('工作台正在使用中...', 0xffa502);
				return;
			}

			if (processedItem && processedItem.ready) {
				this.showMessage('请先用空格键取回完成的食材', 0xffa502);
				return;
			}

			if (this.playerHolding) {
				this.processItemAtStation(station, stationType);
			} else {
				this.showMessage(
					`请先拿取食材再使用${this.getStationName(stationType)}`,
					0xff6b6b
				);
			}
		}
	}

	handlePlateInteraction(player, plate) {
		const contents = plate.getData('contents') || [];
		const plateType = plate.getData('plateType') || 'clean'; // clean, dirty

		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			// 空格键：放置/取出物品（不涉及盘子本身的拾取）
			if (this.playerHolding) {
				// 玩家手持物品的情况
				if (
					this.playerHolding.type === 'plate' ||
					this.playerHolding.type === 'dirty_plate'
				) {
					// 手持盘子，放下盘子
					this.placePlateOnGround(this.player.x, this.player.y);
				} else if (this.playerHolding.type === 'prepared_plate') {
					// 手持装好的盘子，放下装好的盘子
					this.placePreparedPlateOnGround(this.player.x, this.player.y);
				} else if (plateType === 'clean' && plate.visible) {
					// 对着可见的干净盘子，将手持物品放到盘子上
					contents.push(this.playerHolding.type);
					plate.setData('contents', contents);

					this.showMessage(
						`将 ${this.getItemDisplayName(this.playerHolding.type)} 放到盘子上`,
						0x2ed573
					);
					this.playerHolding = null;

					console.log('🍽️ 将物品放到盘子上:', {
						plateId: plate.getData('plateId'),
						newContents: contents,
						plateVisible: plate.visible,
						plateType: plateType,
					});

					// 发送游戏状态更新事件
					this.emitGameStateUpdate();

					// 多人游戏：同步盘子状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
					}
				} else {
					this.showMessage('无法将物品放到这个盘子上', 0xff6b6b);
				}
			} else {
				// 玩家手上没有物品的情况 - 从盘子中取出物品
				if (plateType === 'clean' && contents.length > 0 && plate.visible) {
					// 从有内容的盘子中取出最后一个物品
					const lastItem = contents.pop();
					plate.setData('contents', contents);
					this.playerHolding = { type: lastItem };

					this.showMessage(
						`从盘子中取出了 ${this.getItemDisplayName(lastItem)}`,
						0x2ed573
					);

					console.log('🍽️ 从盘子中取出物品:', {
						plateId: plate.getData('plateId'),
						takenItem: lastItem,
						remainingContents: contents,
					});

					// 多人游戏：同步盘子状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
						this.syncPlayerPosition(); // 同步手持物品
					}

					// 发送游戏状态更新事件
					this.emitGameStateUpdate();
				} else if (
					plateType === 'clean' &&
					contents.length === 0 &&
					plate.visible
				) {
					this.showMessage('盘子是空的，用E键可以拾取空盘子', 0xffa502);
				} else if (plateType === 'dirty' && plate.visible) {
					this.showMessage('脏盘子需要先清洗，用E键拾取脏盘子', 0xffa502);
				} else if (!plate.visible) {
					this.showMessage('盘子已被其他玩家拾取', 0xff6b6b);
				}
			}
		} else if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
			// E键：拾取/放下盘子本身
			if (this.playerHolding) {
				// 玩家手持物品时的E键操作
				if (
					plateType === 'clean' &&
					contents.length > 0 &&
					!this.playerHolding &&
					plate.visible
				) {
					// 拿起整个装好的盘子（只有在手上没有物品时才能操作）
					this.playerHolding = {
						type: 'prepared_plate',
						contents: [...contents],
						plateId: plate.getData('plateId'),
					};
					plate.setData('contents', []);
					plate.setVisible(false);

					const contentsDisplay = contents
						.map((item) => this.getItemDisplayName(item))
						.join(', ');
					this.showMessage(`拿起了装有 ${contentsDisplay} 的盘子`, 0x2ed573);

					console.log('🍽️ 拿起装好的盘子:', {
						plateId: plate.getData('plateId'),
						contents: contents,
					});

					// 多人游戏：同步盘子状态和手持物品
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
						this.syncPlayerPosition();
					}

					this.emitGameStateUpdate();
				} else {
					this.showMessage('手上已有物品，无法拾取盘子', 0xff6b6b);
				}
			} else {
				// 玩家手上没有物品时的E键操作
				if (plateType === 'dirty' && plate.visible) {
					// 拾取脏盘子
					this.playerHolding = {
						type: 'dirty_plate',
						plateId: plate.getData('plateId'),
					};
					plate.setVisible(false);

					console.log('🍽️ 拾取脏盘子:', {
						plateId: plate.getData('plateId'),
						playerHolding: this.playerHolding,
					});

					this.showMessage('拾取了脏盘子，去洗碗槽清洗', 0x2ed573);

					// 多人游戏：同步盘子状态和手持物品
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
						this.syncPlayerPosition();
					}

					this.emitGameStateUpdate();
				} else if (
					plateType === 'clean' &&
					contents.length === 0 &&
					plate.visible
				) {
					// 拾取空的干净盘子
					this.playerHolding = {
						type: 'plate',
						plateId: plate.getData('plateId'),
					};
					plate.setVisible(false);

					console.log('🍽️ 拾取干净盘子:', {
						plateId: plate.getData('plateId'),
						playerHolding: this.playerHolding,
					});

					this.showMessage('拾取了空盘子', 0x2ed573);

					// 多人游戏：同步盘子状态和手持物品
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
						this.syncPlayerPosition();
					}

					this.emitGameStateUpdate();
				} else if (
					plateType === 'clean' &&
					contents.length > 0 &&
					plate.visible
				) {
					// 拿起整个装好的盘子
					this.playerHolding = {
						type: 'prepared_plate',
						contents: [...contents],
						plateId: plate.getData('plateId'),
					};
					plate.setData('contents', []);
					plate.setVisible(false);

					const contentsDisplay = contents
						.map((item) => this.getItemDisplayName(item))
						.join(', ');
					this.showMessage(`拿起了装有 ${contentsDisplay} 的盘子`, 0x2ed573);

					console.log('🍽️ 拿起装好的盘子:', {
						plateId: plate.getData('plateId'),
						contents: contents,
					});

					// 多人游戏：同步盘子状态和手持物品
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
						this.syncPlayerPosition();
					}

					this.emitGameStateUpdate();
				} else if (!plate.visible) {
					this.showMessage('盘子已被其他玩家拾取', 0xff6b6b);
				}
			}
		}
	}

	handleWashStationInteraction(player, washStation) {
		const isWashing = washStation.getData('isWashing');
		const cleanPlate = washStation.getData('cleanPlate');

		// 移除取回干净盘子的逻辑，因为盘子现在自动回到原位
		// 保留空格键逻辑以防万一需要向后兼容
		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			if (cleanPlate && !this.playerHolding) {
				// 清除cleanPlate状态，但不给玩家盘子（因为盘子已经自动回到原位）
				washStation.setData('cleanPlate', null);
				this.showMessage('洗碗槽已清理完毕', 0x2ed573);

				// 多人游戏：同步洗碗槽状态
				if (this.gameMode === 'multiplayer') {
					this.syncWashStationState(washStation);
				}
				return;
			}
		}

		if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
			// E键：开始清洗脏盘子
			if (isWashing) {
				this.showMessage('洗碗槽正在使用中...', 0xffa502);
				return;
			}

			if (cleanPlate) {
				this.showMessage('洗碗槽中还有清洗完的盘子，请按空格键清理', 0xffa502);
				return;
			}

			if (this.playerHolding && this.playerHolding.type === 'dirty_plate') {
				this.startWashing(washStation);
			} else {
				this.showMessage('请先拿取脏盘子再使用洗碗槽', 0xff6b6b);
			}
		}
	}

	handleTrashInteraction(player, trash) {
		if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
			if (this.playerHolding) {
				const itemType = this.playerHolding.type;

				// 检查是否是烤糊的食物
				if (itemType === 'burnt_tomato' || itemType === 'burnt_lettuce') {
					this.showMessage('烤糊的食物已丢弃！', 0x2ed573);
					this.createTrashEffect(trash.x, trash.y);

					// 清空手持物品
					this.playerHolding = null;

					// 多人游戏：立即同步手持物品状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlayerPosition(); // 这会同时同步位置和手持物品
					}

					// 发送游戏状态更新事件
					this.emitGameStateUpdate();

					console.log('🗑️ 烤糊食物已丢弃:', {
						itemType: itemType,
						playerHolding: this.playerHolding,
					});
				} else if (this.playerHolding.type === 'prepared_plate') {
					this.showMessage('丢弃了装好的盘子', 0xff6b6b);
					this.createTrashEffect(trash.x, trash.y);

					// 清空手持物品
					this.playerHolding = null;

					// 多人游戏：立即同步手持物品状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlayerPosition();
					}

					// 发送游戏状态更新事件
					this.emitGameStateUpdate();
				} else {
					// 其他物品不能丢弃到垃圾桶
					this.showMessage(
						`${this.getItemDisplayName(itemType)} 不能丢弃到垃圾桶`,
						0xff6b6b
					);
				}
			} else {
				this.showMessage('没有物品可以丢弃', 0xa4b0be);
			}
		}
	}

	handleGroundItemInteraction(player, groundItem) {
		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			if (!this.playerHolding) {
				const itemType = groundItem.getData('type');
				const itemContents = groundItem.getData('contents');

				// 多人游戏：同步地面物品移除
				if (this.gameMode === 'multiplayer') {
					this.syncGroundItemRemove(groundItem);
				}

				// 拾取地面物品
				if (itemType === 'prepared_plate' || itemContents) {
					// 装好的盘子
					this.playerHolding = {
						type: 'prepared_plate',
						contents: itemContents || [],
					};
				} else {
					// 普通物品
					this.playerHolding = {
						type: itemType,
						contents: itemContents || null,
					};
				}

				// 创建拾取效果
				this.createPickupEffect(groundItem.x, groundItem.y);

				// 移除地面物品
				groundItem.destroy();

				this.showMessage(
					`拾取了 ${this.getItemDisplayName(this.playerHolding.type)}`,
					0x2ed573
				);

				// 发送游戏状态更新事件
				this.emitGameStateUpdate();

				// 多人游戏：立即同步手持物品状态
				if (this.gameMode === 'multiplayer') {
					this.syncPlayerPosition(); // 这会同时同步位置和手持物品
				}
			} else {
				this.showMessage('手上已有物品，无法拾取', 0xff6b6b);
			}
		}
	}

	handleExtinguisherInteraction(player, extinguisher) {
		if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
			if (!this.playerHolding) {
				// 拾取灭火器
				this.playerHolding = {
					type: 'extinguisher',
					extinguisherObject: extinguisher, // 保存灭火器对象引用
				};

				// 只隐藏灭火器，不设置setActive(false)，这样碰撞检测仍然有效
				extinguisher.setVisible(false);
				// extinguisher.setActive(false); // 移除这行，保持碰撞检测

				console.log('🧯 拾取灭火器:', {
					position: { x: extinguisher.x, y: extinguisher.y },
					visible: false,
					active: true, // 保持活跃状态
					playerHolding: this.playerHolding,
				});

				// 多人游戏：同步灭火器状态（被拾取）
				if (this.gameMode === 'multiplayer') {
					this.syncExtinguisherState(
						{ x: extinguisher.x, y: extinguisher.y },
						true, // isHeld = true
						false, // visible = false
						true // active = true
					);
					this.syncPlayerPosition(); // 同步手持物品
				}

				this.showMessage('拾取了灭火器，去灭火吧！', 0x2ed573);

				// 发送游戏状态更新事件
				this.emitGameStateUpdate();
			} else {
				this.showMessage('手上已有物品，无法拾取灭火器', 0xff6b6b);
			}
		}
	}

	// 在空白区域放置物品
	handleGroundPlacement() {
		if (Phaser.Input.Keyboard.JustDown(this.qKey) && this.playerHolding) {
			// 检查是否在合适的位置放置（避免与其他对象重叠）
			const playerX = this.player.x;
			const playerY = this.player.y;

			// 检查放置位置是否合适
			if (this.isValidPlacementPosition(playerX, playerY)) {
				if (this.playerHolding.type === 'extinguisher') {
					// 放下灭火器 - 恢复灭火器对象的可见性和位置
					const extinguisherObj = this.playerHolding.extinguisherObject;
					if (extinguisherObj) {
						extinguisherObj.setPosition(playerX, playerY);
						extinguisherObj.setVisible(true);
						// 确保灭火器是活跃的（虽然拾取时没有设置为false，但为了保险起见）
						extinguisherObj.setActive(true);

						// 强制更新物理体位置（确保碰撞检测正确）
						if (extinguisherObj.body) {
							extinguisherObj.body.updateFromGameObject();
						}

						console.log('🧯 放下灭火器:', {
							position: { x: playerX, y: playerY },
							visible: true,
							active: true,
							hasBody: !!extinguisherObj.body,
							bodyPosition: extinguisherObj.body
								? { x: extinguisherObj.body.x, y: extinguisherObj.body.y }
								: null,
						});

						// 多人游戏：同步灭火器状态（被放下）
						if (this.gameMode === 'multiplayer') {
							this.syncExtinguisherState(
								{ x: playerX, y: playerY },
								false, // isHeld = false
								true, // visible = true
								true // active = true
							);
						}

						this.showMessage('放下了灭火器', 0x2ed573);
					} else {
						// 如果没有保存的对象引用，创建新的灭火器（向后兼容）
						const newExtinguisher = this.extinguisher
							.create(playerX, playerY, 'extinguisher')
							.setSize(32, 32);

						console.log('🧯 创建新灭火器（向后兼容）:', {
							position: { x: playerX, y: playerY },
							visible: true,
							active: true,
						});

						// 多人游戏：同步灭火器状态（新创建）
						if (this.gameMode === 'multiplayer') {
							this.syncExtinguisherState(
								{ x: playerX, y: playerY },
								false, // isHeld = false
								true, // visible = true
								true // active = true
							);
						}

						this.showMessage('放下了灭火器', 0x2ed573);
					}
				} else if (this.playerHolding.type === 'prepared_plate') {
					// 装好的盘子特殊处理
					let groundItem = this.groundItems.create(
						playerX,
						playerY,
						'prepared_plate'
					);
					groundItem.setData('type', 'prepared_plate');
					groundItem.setData('contents', this.playerHolding.contents);
					groundItem.setSize(28, 28);

					const contentsDisplay = this.playerHolding.contents
						.map((item) => this.getItemDisplayName(item))
						.join(', ');
					this.showMessage(`放下了装有 ${contentsDisplay} 的盘子`, 0x2ed573);
				} else {
					// 普通物品
					let groundItem = this.groundItems.create(
						playerX,
						playerY,
						this.playerHolding.type
					);
					groundItem.setData('type', this.playerHolding.type);
					groundItem.setSize(28, 28);

					// 如果是装好的盘子，保存内容
					if (this.playerHolding.contents) {
						groundItem.setData('contents', this.playerHolding.contents);
					}

					this.showMessage(
						`放下了 ${this.getItemDisplayName(this.playerHolding.type)}`,
						0x2ed573
					);

					// 多人游戏：同步地面物品添加（灭火器不需要同步地面物品）
					if (this.gameMode === 'multiplayer') {
						this.syncGroundItemAdd(groundItem);
					}
				}

				// 清空玩家手持
				this.playerHolding = null;

				// 发送游戏状态更新事件
				this.emitGameStateUpdate();

				// 多人游戏：同步手持物品变化
				if (this.gameMode === 'multiplayer') {
					this.syncPlayerPosition();
				}
			} else {
				this.showMessage('这里无法放置物品', 0xff6b6b);
			}
		}
	}

	showMessage(text, color = 0xffffff) {
		if (this.messageText) {
			this.messageText.destroy();
		}

		this.messageText = this.add
			.text(400, 300, text, {
				fontSize: '24px',
				fill: `#${color.toString(16).padStart(6, '0')}`,
				fontFamily: 'Arial',
				backgroundColor: 'rgba(0,0,0,0.8)',
				padding: { x: 20, y: 10 },
				originX: 0.5,
				originY: 0.5,
			})
			.setDepth(200);

		this.tweens.add({
			targets: this.messageText,
			alpha: 0,
			duration: 2000,
			delay: 1000,
			onComplete: () => {
				if (this.messageText) {
					this.messageText.destroy();
					this.messageText = null;
				}
			},
		});
	}

	emitGameStateUpdate() {
		const gameState = {
			currentOrder: this.currentOrder,
			score: this.score,
			timeLeft: this.timeLeft,
			completedOrders: this.completedOrders,
			playerHolding: this.playerHolding ? this.playerHolding.type : null,
			recipeSteps: this.currentOrder
				? this.getRecipeSteps(this.currentOrder.id)
				: '',
		};

		// 发送自定义事件到window对象
		window.dispatchEvent(
			new CustomEvent('gameStateUpdate', { detail: gameState })
		);
	}

	// 特效方法
	createPickupEffect(x, y) {
		const effect = this.add
			.text(x, y, '+', {
				fontSize: '20px',
				fill: '#2ED573',
				fontFamily: 'Arial',
			})
			.setDepth(100);

		this.tweens.add({
			targets: effect,
			y: y - 30,
			alpha: 0,
			duration: 1000,
			onComplete: () => effect.destroy(),
		});
	}

	createTrashEffect(x, y) {
		const effect = this.add
			.text(x, y, '🗑️', {
				fontSize: '20px',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			scaleX: 0.5,
			scaleY: 0.5,
			alpha: 0,
			duration: 1000,
			onComplete: () => effect.destroy(),
		});
	}

	isValidPlacementPosition(x, y) {
		const minDistance = 50; // 最小距离

		// 检查是否与现有对象太近
		const allObjects = [
			...this.ingredients.children.entries,
			...this.stations.children.entries,
			...this.plates.children.entries,
			...this.washStation.children.entries,
			...this.trash.children.entries,
			...this.groundItems.children.entries,
			...this.extinguisher.children.entries, // 添加灭火器对象
		];

		for (const obj of allObjects) {
			// 如果是灭火器且当前正在放下灭火器，跳过距离检查
			if (
				this.playerHolding &&
				this.playerHolding.type === 'extinguisher' &&
				this.extinguisher.children.entries.includes(obj)
			) {
				continue;
			}

			if (Phaser.Math.Distance.Between(x, y, obj.x, obj.y) < minDistance) {
				return false;
			}
		}

		// 检查是否在游戏区域内（避免放在UI区域）
		if (x < 80 || x > 720 || y < 100 || y > 500) {
			return false;
		}

		return true;
	}

	getStationName(type) {
		const names = {
			cutting: '切菜台',
			cooking: '烹饪台',
			serving: '出餐口',
		};
		return names[type] || type;
	}

	handleServingStation(station) {
		// 检查玩家是否手持盘子
		if (!this.playerHolding || this.playerHolding.type !== 'prepared_plate') {
			this.showMessage('请先准备好装有食材的盘子', 0xff6b6b);
			return;
		}

		// 检查盘子内容是否符合订单要求
		const plateContents = this.playerHolding.contents || [];
		if (this.checkOrderMatch(plateContents)) {
			this.completeOrderAtServing();
		} else {
			this.showMessage('盘子内容不符合订单要求', 0xff6b6b);
		}
	}

	checkOrderMatch(plateContents) {
		const requiredIngredients = [...this.currentOrder.ingredients];
		const tempPlateContents = [...plateContents];

		// 检查是否包含所有必需的食材
		for (const ingredient of requiredIngredients) {
			const index = tempPlateContents.indexOf(ingredient);
			if (index !== -1) {
				tempPlateContents.splice(index, 1);
			} else {
				return false;
			}
		}

		// 检查是否有多余的食材
		return tempPlateContents.length === 0;
	}

	completeOrderAtServing() {
		if (this.gameEnded) return;

		// 保存原来的盘子内容用于清空匹配的盘子
		const plateContents = this.playerHolding
			? this.playerHolding.contents || []
			: [];

		// 找到被使用的盘子（通过plateId）
		const usedPlate =
			this.playerHolding && this.playerHolding.plateId
				? this.findPlateById(this.playerHolding.plateId)
				: this.findPlateByContents(plateContents); // 向后兼容

		console.log('🍽️ 出餐完成，查找使用的盘子:', {
			playerHolding: this.playerHolding,
			plateContents: plateContents,
			usedPlateId: this.playerHolding?.plateId,
			foundPlate: usedPlate
				? {
						id: usedPlate.getData('plateId'),
						position: { x: usedPlate.x, y: usedPlate.y },
						visible: usedPlate.visible,
						active: usedPlate.active,
				  }
				: null,
		});

		// 清空玩家手持
		this.playerHolding = null;

		// 多人游戏：立即同步手持物品状态
		if (this.gameMode === 'multiplayer') {
			this.syncPlayerPosition(); // 这会同时同步位置和手持物品

			// 清空所有匹配内容的盘子
			this.clearMatchingPlates(plateContents);
		}

		// 增加分数
		this.score += this.currentOrder.points;
		this.completedOrders++;

		// 创建完成效果
		this.createOrderCompletionEffect(500, 280); // 出餐口位置

		// 显示完成消息
		this.showMessage(
			`订单完成！获得 ${this.currentOrder.points} 分！`,
			0xffd700
		);

		// 将使用的盘子变为脏盘子
		this.convertPlateToDirty(usedPlate, plateContents);

		// 停止当前订单计时器
		if (this.orderTimer) {
			this.orderTimer.remove();
			this.orderTimer = null;
		}

		// 发送游戏状态更新事件
		this.emitGameStateUpdate();

		// 生成新订单
		this.time.delayedCall(2000, () => {
			if (!this.gameEnded) {
				this.generateOrder();
			}
		});
	}

	processItemAtStation(station, stationType) {
		const itemType = this.playerHolding.type;
		let canProcess = false;
		let processTime = 0;
		let resultType = '';

		switch (stationType) {
			case 'cutting':
				if (itemType === 'tomato' || itemType === 'lettuce') {
					canProcess = true;
					processTime = this.gameConfig.choppingTime;
					resultType = `chopped_${itemType}`;
				}
				break;
			case 'cooking':
				if (itemType === 'chopped_tomato' || itemType === 'chopped_lettuce') {
					canProcess = true;
					processTime = this.gameConfig.cookingTime;
					resultType = itemType.replace('chopped_', 'cooked_');
				}
				break;
			case 'serving':
				// 出餐口不用于加工，给出提示
				this.showMessage(
					'出餐口用于递交完成的订单，请将装好的盘子放在这里',
					0xffa502
				);
				return;
		}

		if (canProcess) {
			if (stationType === 'cooking') {
				// 烹饪台：自动处理模式
				this.startAutoCooking(station, stationType, resultType, processTime);
			} else {
				// 其他工作台：原有的手动处理模式
				this.startProcessing(station, stationType, resultType, processTime);
			}
		} else {
			this.showMessage(
				`无法在${this.getStationName(stationType)}处理${this.getItemDisplayName(
					itemType
				)}`,
				0xff6b6b
			);
		}
	}

	startProcessing(station, stationType, resultType, processTime) {
		station.setData('isProcessing', true);
		station.setData('processingItem', this.playerHolding);
		station.setData('resultType', resultType);
		station.setData('startTime', this.time.now);

		// 设置工作台内容 - 将正在处理的物品添加到contents中
		const currentContents = station.getData('contents') || [];
		currentContents.push(this.playerHolding.type);
		station.setData('contents', currentContents);

		console.log('🔧 开始处理，工作台状态:', {
			stationType,
			processingItem: this.playerHolding,
			resultType,
			contents: currentContents,
			isProcessing: true,
		});

		// 清空玩家手持
		this.playerHolding = null;

		// 多人游戏：同步工作台状态和手持物品状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
			this.syncPlayerPosition(); // 这会同时同步位置和手持物品
		}

		// 显示处理中效果
		this.showProcessingEffect(station, processTime);

		// 开始粒子效果
		if (stationType === 'cooking') {
			this.cookingParticles.setPosition(station.x, station.y - 20);
			this.cookingParticles.start();
		}

		this.showMessage(`开始${this.getStationName(stationType)}...`, 0x2ed573);

		// 处理完成后的回调
		const completionTimer = this.time.delayedCall(processTime, () => {
			this.completeProcessing(station, stationType, resultType);
		});
		station.setData('completionTimer', completionTimer);

		// 如果是烹饪台，设置烤糊计时器
		if (stationType === 'cooking') {
			const burntTimer = this.time.delayedCall(
				this.gameConfig.burntTime,
				() => {
					this.burnFood(station, stationType);
				}
			);
			station.setData('burntTimer', burntTimer);
		}
	}

	startAutoCooking(station, stationType, resultType, processTime) {
		// 检查烹饪台是否着火
		const isOnFire = station.getData('isOnFire');
		if (isOnFire) {
			this.showMessage('烹饪台着火了！请先用灭火器灭火！', 0xff6b6b);
			return;
		}

		station.setData('isProcessing', true);
		station.setData('processingItem', this.playerHolding);
		station.setData('resultType', resultType);
		station.setData('startTime', this.time.now);

		// 设置工作台内容 - 将正在处理的物品添加到contents中
		const currentContents = station.getData('contents') || [];
		currentContents.push(this.playerHolding.type);
		station.setData('contents', currentContents);

		console.log('🔥 开始自动烹饪，工作台状态:', {
			stationType,
			processingItem: this.playerHolding,
			resultType,
			contents: currentContents,
			isProcessing: true,
			cookingTime: processTime,
		});

		// 清空玩家手持
		this.playerHolding = null;

		// 多人游戏：同步工作台状态和手持物品状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
			this.syncPlayerPosition(); // 这会同时同步位置和手持物品
		}

		// 显示处理中效果（绿色进度条）
		this.showProcessingEffect(station, processTime);

		// 开始粒子效果
		this.cookingParticles.setPosition(station.x, station.y - 20);
		this.cookingParticles.start();

		this.showMessage(`食材已放入烹饪台，开始自动烹饪...`, 0x2ed573);

		// 烹饪完成计时器（3秒后完成烹饪）
		const completionTimer = this.time.delayedCall(processTime, () => {
			this.completeAutoCooking(station, stationType, resultType);
		});
		station.setData('completionTimer', completionTimer);

		// 注意：不在这里设置着火计时器，着火倒计时只在烹饪完成后开始
	}

	startWashing(washStation) {
		// 记录正在洗的脏盘子（从玩家手中获取）
		const dirtyPlateId = this.playerHolding ? this.playerHolding.plateId : null;
		const dirtyPlate = dirtyPlateId ? this.findPlateById(dirtyPlateId) : null;

		washStation.setData('isWashing', true);
		washStation.setData('washingPlate', dirtyPlate); // 记录正在洗的盘子

		console.log('🚿 开始洗碗:', {
			dirtyPlateId,
			dirtyPlate: dirtyPlate
				? {
						id: dirtyPlate.getData('plateId'),
						position: { x: dirtyPlate.x, y: dirtyPlate.y },
						plateType: dirtyPlate.getData('plateType'),
				  }
				: null,
		});

		// 清空玩家手持
		this.playerHolding = null;

		// 多人游戏：同步洗碗槽状态和手持物品状态
		if (this.gameMode === 'multiplayer') {
			this.syncWashStationState(washStation);
			this.syncPlayerPosition(); // 这会同时同步位置和手持物品
		}

		// 显示清洗中效果
		this.showProcessingEffect(washStation, this.gameConfig.washTime);

		this.showMessage('开始清洗盘子...', 0x2ed573);

		// 清洗完成后的回调
		this.time.delayedCall(this.gameConfig.washTime, () => {
			this.completeWashing(washStation);
		});
	}

	completeWashing(washStation) {
		const washingPlate = washStation.getData('washingPlate');

		washStation.setData('isWashing', false);
		washStation.setData('cleanPlate', true);
		washStation.setData('washingPlate', null); // 清除正在洗的盘子记录

		// 如果有正在洗的盘子，创建新的干净盘子并销毁脏盘子
		if (washingPlate) {
			const plateId = washingPlate.getData('plateId');
			const originalPosition = washingPlate.getData('originalPosition');

			// 计算洗碗槽附近的位置（洗碗槽右侧）
			const cleanPlatePosition = {
				x: washStation.x + 50, // 洗碗槽右侧50像素
				y: washStation.y,
			};

			console.log('🚿 洗碗完成，创建新的干净盘子:', {
				plateId,
				originalPosition,
				cleanPlatePosition,
				dirtyPlatePosition: { x: washingPlate.x, y: washingPlate.y },
			});

			// 创建新的干净盘子对象
			const cleanPlate = this.plates.create(
				cleanPlatePosition.x,
				cleanPlatePosition.y,
				'plate'
			);

			// 设置盘子的基本属性
			cleanPlate.setData('plateType', 'clean');
			cleanPlate.setData('contents', []);
			cleanPlate.setData('plateId', plateId); // 保持相同的ID
			cleanPlate.setData('originalPosition', originalPosition); // 保持原始位置信息

			// 设置物理属性 - 确保与初始盘子一致
			cleanPlate.setSize(28, 28);
			cleanPlate.setVisible(true);
			cleanPlate.setActive(true);

			// 确保物理体正确设置（staticGroup会自动创建物理体）
			if (cleanPlate.body) {
				cleanPlate.body.setSize(28, 28);
				cleanPlate.body.updateFromGameObject(); // 强制更新物理体位置
			}

			// 强制刷新物理体（确保碰撞检测正常工作）
			cleanPlate.refreshBody();

			console.log('🚿 创建新的干净盘子，属性检查:', {
				plateId,
				plateType: cleanPlate.getData('plateType'),
				contents: cleanPlate.getData('contents'),
				visible: cleanPlate.visible,
				active: cleanPlate.active,
				texture: cleanPlate.texture.key,
				position: { x: cleanPlate.x, y: cleanPlate.y },
				inPlatesGroup: this.plates.children.entries.includes(cleanPlate),
				hasBody: !!cleanPlate.body,
				bodySize: cleanPlate.body
					? { width: cleanPlate.body.width, height: cleanPlate.body.height }
					: null,
			});

			// 从盘子池中移除脏盘子，添加新的干净盘子
			const poolIndex = this.platePool.findIndex((p) => p === washingPlate);
			if (poolIndex !== -1) {
				this.platePool[poolIndex] = cleanPlate;
				console.log('🚿 更新盘子池（洗碗完成）:', {
					plateId,
					poolIndex,
					oldPlate: 'dirty_plate_object',
					newPlate: 'clean_plate_object',
				});
			}

			// 销毁脏盘子对象（延迟销毁，确保引用安全）
			this.time.delayedCall(100, () => {
				if (washingPlate && washingPlate.scene) {
					washingPlate.destroy();
					console.log('🚿 脏盘子对象已销毁:', { plateId });
				}
			});

			console.log('🚿 洗碗完成，新盘子状态:', {
				plateId,
				newPosition: cleanPlatePosition,
				plateType: 'clean',
				texture: 'plate',
			});

			// 多人游戏：同步盘子状态
			if (this.gameMode === 'multiplayer') {
				this.time.delayedCall(50, () => {
					this.syncPlateState(cleanPlate);
				});
			}

			this.showMessage('盘子清洗完成！已放在洗碗槽旁边', 0xffd700);
		} else {
			this.showMessage('盘子清洗完成！按空格键取回', 0xffd700);
		}

		// 多人游戏：同步洗碗槽状态
		if (this.gameMode === 'multiplayer') {
			this.syncWashStationState(washStation);
		}

		// 创建完成效果
		this.createCompletionEffect(washStation.x, washStation.y);
	}

	extinguishFire(station) {
		// 灭火过程
		station.setData('isOnFire', false);

		// 检查是否有烤糊食物
		const processedItem = station.getData('processedItem');
		const hasBurntFood =
			processedItem &&
			(processedItem.type === 'burnt_tomato' ||
				processedItem.type === 'burnt_lettuce');

		// 灭火后总是恢复正常纹理，不管是否有烤糊食物
		station.setTexture('cooking_station');

		// 灭火器不消耗，玩家继续持有
		// this.playerHolding = null; // 移除这行，让玩家继续持有灭火器

		// 多人游戏：同步工作台状态（不需要同步手持物品，因为没有变化）
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}

		// 创建灭火效果
		this.createExtinguishEffect(station.x, station.y);

		if (hasBurntFood) {
			this.showMessage('火已扑灭！请拾取烤糊食物恢复烹饪台', 0xffa502);
		} else {
			this.showMessage('火已扑灭！烹饪台已恢复可用', 0x2ed573);
		}

		// 发送游戏状态更新事件
		this.emitGameStateUpdate();
	}

	placePlateOnGround(x, y) {
		// 检查放置位置是否合适
		if (this.isValidPlacementPosition(x, y)) {
			// 如果手持的是已有盘子，恢复其可见性
			if (this.playerHolding.plateId) {
				const plate = this.findPlateById(this.playerHolding.plateId);
				if (plate) {
					// 恢复盘子的可见性和位置
					plate.setVisible(true);
					plate.setActive(true);
					plate.setPosition(x, y);

					// 根据手持类型设置正确的纹理和状态
					if (this.playerHolding.type === 'dirty_plate') {
						plate.setTexture('dirty_plate');
						plate.setData('plateType', 'dirty');
					} else {
						plate.setTexture('plate');
						plate.setData('plateType', 'clean');
					}

					console.log('🍽️ 放下盘子:', {
						plateId: this.playerHolding.plateId,
						position: { x, y },
						plateType: plate.getData('plateType'),
					});

					// 多人游戏：同步盘子状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
					}
				}
			} else {
				// 如果没有plateId，创建新盘子（向后兼容）
				let plateTexture = 'plate';
				let plateType = 'clean';

				if (this.playerHolding.type === 'dirty_plate') {
					plateTexture = 'dirty_plate';
					plateType = 'dirty';
				}

				// 在地面创建盘子
				const plate = this.plates.create(x, y, plateTexture);
				plate.setData('contents', []);
				plate.setData('plateType', plateType);
				plate.setSize(28, 28);

				console.log('🍽️ 创建新盘子（向后兼容）:', {
					position: { x, y },
					plateType,
				});
			}

			this.showMessage(
				`放下了 ${this.getItemDisplayName(this.playerHolding.type)}`,
				0x2ed573
			);

			// 清空玩家手持
			this.playerHolding = null;

			// 发送游戏状态更新事件
			this.emitGameStateUpdate();
		} else {
			this.showMessage('这里无法放置盘子', 0xff6b6b);
		}
	}

	placePreparedPlateOnGround(x, y) {
		// 检查放置位置是否合适
		if (this.isValidPlacementPosition(x, y)) {
			// 如果手持的装好盘子有plateId，恢复对应的盘子
			if (this.playerHolding.plateId) {
				const plate = this.findPlateById(this.playerHolding.plateId);
				if (plate) {
					// 恢复盘子的可见性、位置和内容
					plate.setVisible(true);
					plate.setActive(true);
					plate.setPosition(x, y);
					plate.setData('contents', [...this.playerHolding.contents]); // 恢复盘子内容
					plate.setData('plateType', 'clean');
					plate.setTexture('plate');

					console.log('🍽️ 恢复装好的盘子:', {
						plateId: this.playerHolding.plateId,
						position: { x, y },
						contents: this.playerHolding.contents,
					});

					// 多人游戏：同步盘子状态
					if (this.gameMode === 'multiplayer') {
						this.syncPlateState(plate);
					}
				} else {
					console.warn('⚠️ 找不到对应的盘子，创建新盘子');
					// 如果找不到对应的盘子，创建新盘子（向后兼容）
					const plateTexture = this.textures.exists('new_plate')
						? 'new_plate'
						: 'plate';
					const plate = this.plates.create(x, y, plateTexture);
					plate.setData('contents', [...this.playerHolding.contents]);
					plate.setData('plateType', 'clean');
					plate.setSize(28, 28);
				}
			} else {
				// 如果没有plateId，创建新盘子（向后兼容）
				const plateTexture = this.textures.exists('new_plate')
					? 'new_plate'
					: 'plate';
				const plate = this.plates.create(x, y, plateTexture);
				plate.setData('contents', [...this.playerHolding.contents]);
				plate.setData('plateType', 'clean');
				plate.setSize(28, 28);

				console.log('🍽️ 创建新装好的盘子（向后兼容）:', {
					position: { x, y },
					contents: this.playerHolding.contents,
				});
			}

			const contentsDisplay = this.playerHolding.contents
				.map((item) => this.getItemDisplayName(item))
				.join(', ');

			this.showMessage(`放下了装有 ${contentsDisplay} 的盘子`, 0x2ed573);

			// 清空玩家手持
			this.playerHolding = null;

			// 多人游戏：同步手持物品
			if (this.gameMode === 'multiplayer') {
				this.syncPlayerPosition();
			}

			// 发送游戏状态更新事件
			this.emitGameStateUpdate();
		} else {
			this.showMessage('这里无法放置盘子', 0xff6b6b);
		}
	}

	// 特效方法
	createCompletionEffect(x, y) {
		const effect = this.add
			.text(x, y, '✓', {
				fontSize: '24px',
				fill: '#FFD700',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			scaleX: 1.5,
			scaleY: 1.5,
			alpha: 0,
			duration: 1500,
			onComplete: () => effect.destroy(),
		});
	}

	createOrderCompletionEffect(x, y) {
		const effect = this.add
			.text(x, y, '🎉', {
				fontSize: '32px',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			y: y - 50,
			scaleX: 2,
			scaleY: 2,
			alpha: 0,
			duration: 2000,
			onComplete: () => effect.destroy(),
		});
	}

	createExtinguishEffect(x, y) {
		const effect = this.add
			.text(x, y, '💨', {
				fontSize: '24px',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			y: y - 30,
			scaleX: 2,
			scaleY: 2,
			alpha: 0,
			duration: 2000,
			onComplete: () => effect.destroy(),
		});
	}

	showProcessingEffect(station, duration) {
		// 创建进度条
		const progressBg = this.add.graphics();
		progressBg.fillStyle(0x333333);
		progressBg.fillRect(station.x - 30, station.y - 40, 60, 8);
		progressBg.setDepth(50);

		const progressBar = this.add.graphics();
		progressBar.fillStyle(0x2ed573);
		progressBar.setDepth(51);

		// 动画进度条
		let progress = 0;
		const progressTimer = this.time.addEvent({
			delay: 50,
			callback: () => {
				progress += 50 / duration;
				progressBar.clear();
				progressBar.fillStyle(0x2ed573);
				progressBar.fillRect(station.x - 28, station.y - 38, 56 * progress, 4);

				if (progress >= 1) {
					progressTimer.remove();
					progressBg.destroy();
					progressBar.destroy();
				}
			},
			loop: true,
		});
	}

	completeProcessing(station, stationType, resultType) {
		station.setData('isProcessing', false);
		station.setData('processedItem', {
			type: resultType,
			ready: true,
		});

		// 更新工作台内容 - 移除原材料，添加成品
		const currentContents = station.getData('contents') || [];
		const processingItem = station.getData('processingItem');
		if (processingItem) {
			const itemIndex = currentContents.indexOf(processingItem.type);
			if (itemIndex > -1) {
				currentContents.splice(itemIndex, 1);
			}
		}
		currentContents.push(resultType);
		station.setData('contents', currentContents);

		console.log('✅ 处理完成，工作台状态:', {
			stationType,
			processedItem: { type: resultType, ready: true },
			contents: currentContents,
			isProcessing: false,
		});

		// 多人游戏：同步工作台状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}

		// 停止粒子效果
		if (stationType === 'cooking') {
			this.cookingParticles.stop();
		}

		// 创建完成效果
		this.createCompletionEffect(station.x, station.y);

		this.showMessage(
			`${this.getStationName(stationType)}完成！按空格键取回`,
			0xffd700
		);
	}

	completeAutoCooking(station, stationType, resultType) {
		station.setData('isProcessing', false);
		station.setData('processedItem', {
			type: resultType,
			ready: true,
		});

		// 确保烹饪台纹理正确（防止显示为绿色方块）
		if (stationType === 'cooking') {
			station.setTexture('cooking_station');
		}

		// 更新工作台内容 - 移除原材料，添加成品
		const currentContents = station.getData('contents') || [];
		const processingItem = station.getData('processingItem');
		if (processingItem) {
			const itemIndex = currentContents.indexOf(processingItem.type);
			if (itemIndex > -1) {
				currentContents.splice(itemIndex, 1);
			}
		}
		currentContents.push(resultType);
		station.setData('contents', currentContents);

		console.log('🍳 自动烹饪完成，工作台状态:', {
			stationType,
			processedItem: { type: resultType, ready: true },
			contents: currentContents,
			isProcessing: false,
			texture: station.texture.key, // 添加纹理信息到日志
		});

		// 多人游戏：同步工作台状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}

		// 停止粒子效果
		this.cookingParticles.stop();

		// 创建完成效果
		this.createCompletionEffect(station.x, station.y);

		this.showMessage('烹饪完成！按空格键取回食材，否则5秒后会着火！', 0xffd700);

		// 清除原来的着火计时器
		const fireTimer = station.getData('fireTimer');
		if (fireTimer) {
			fireTimer.remove();
			station.setData('fireTimer', null);
		}

		// 启动着火倒计时（5秒）
		this.startFireCountdown(station);
	}

	startFireCountdown(station) {
		console.log('🔥 开始着火倒计时，5秒后着火');

		// 设置着火倒计时状态
		station.setData('fireCountdown', true);
		station.setData('fireCountdownStartTime', this.time.now);

		// 显示着火倒计时进度条（红色）
		this.showFireCountdownEffect(station, this.gameConfig.fireCountdownTime);

		// 启动着火倒计时（5秒）
		const fireTimer = this.time.addEvent({
			delay: this.gameConfig.fireCountdownTime,
			callback: () => {
				// 清除着火倒计时状态
				station.setData('fireCountdown', false);
				station.setData('fireCountdownStartTime', null);

				// 同时产生烤糊食物和着火
				this.burnFood(station, 'cooking');
				this.startFire(station, 'cooking');
			},
		});
		station.setData('fireTimer', fireTimer);

		// 多人游戏：同步工作台状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}
	}

	showFireCountdownEffect(station, duration) {
		// 创建红色进度条背景
		const progressBg = this.add.graphics();
		progressBg.fillStyle(0x333333);
		progressBg.fillRect(station.x - 30, station.y - 40, 60, 8);
		progressBg.setDepth(50);

		const progressBar = this.add.graphics();
		progressBar.fillStyle(0xff4444); // 红色表示危险
		progressBar.setDepth(51);

		// 动画进度条（倒计时效果）
		let progress = 1; // 从满开始倒计时
		const progressTimer = this.time.addEvent({
			delay: 50,
			callback: () => {
				progress -= 50 / duration;
				progressBar.clear();
				progressBar.fillStyle(0xff4444);
				progressBar.fillRect(
					station.x - 28,
					station.y - 38,
					56 * Math.max(0, progress),
					4
				);

				if (progress <= 0) {
					progressTimer.remove();
					progressBg.destroy();
					progressBar.destroy();
				}
			},
			loop: true,
		});

		// 保存进度条引用，以便在取回食物时清除
		station.setData('fireCountdownProgressBg', progressBg);
		station.setData('fireCountdownProgressBar', progressBar);
		station.setData('fireCountdownProgressTimer', progressTimer);
	}

	burnFood(station, stationType) {
		const processingItem = station.getData('processingItem');
		if (!processingItem) return;

		const burntType = processingItem.type.replace('chopped_', 'burnt_');

		station.setData('isProcessing', false);
		station.setData('processedItem', {
			type: burntType,
			ready: true,
		});

		// 更新工作台内容 - 移除原材料，添加烤糊的食物
		const currentContents = station.getData('contents') || [];
		const itemIndex = currentContents.indexOf(processingItem.type);
		if (itemIndex > -1) {
			currentContents.splice(itemIndex, 1);
		}
		currentContents.push(burntType);
		station.setData('contents', currentContents);

		console.log('🔥 食物烤糊，工作台状态:', {
			stationType,
			processedItem: { type: burntType, ready: true },
			contents: currentContents,
			isProcessing: false,
		});

		// 多人游戏：同步工作台状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}

		// 停止粒子效果
		this.cookingParticles.stop();

		// 创建烤糊效果
		this.createBurntEffect(station.x, station.y);

		this.showMessage('食物烤糊了！请拾取烤糊食物恢复烹饪台', 0xff6b6b);
	}

	startFire(station, stationType) {
		station.setData('isOnFire', true);
		station.setTexture('fire_cooking_station'); // 修复：使用正确的纹理名称

		// 检查是否有烤糊食物，如果有则保留
		const processedItem = station.getData('processedItem');
		const hasBurntFood =
			processedItem &&
			(processedItem.type === 'burnt_tomato' ||
				processedItem.type === 'burnt_lettuce');

		if (hasBurntFood) {
			// 有烤糊食物时，只清理正在处理的状态，保留烤糊食物
			station.setData('isProcessing', false);
			// 保留 processedItem（烤糊食物）
			// 保留 contents（包含烤糊食物）

			console.log('🔥 工作台着火，保留烤糊食物:', {
				stationType,
				isOnFire: true,
				processedItem: processedItem,
				contents: station.getData('contents'),
				isProcessing: false,
			});
		} else {
			// 没有烤糊食物时，清空所有内容
			station.setData('contents', []);
			station.setData('isProcessing', false);
			station.setData('processedItem', null);

			console.log('🔥 工作台着火，清空内容:', {
				stationType,
				isOnFire: true,
				contents: [],
				isProcessing: false,
			});
		}

		// 多人游戏：同步工作台状态
		if (this.gameMode === 'multiplayer') {
			this.syncStationState(station);
		}

		// 停止粒子效果
		this.cookingParticles.stop();

		// 创建着火效果
		this.createFireEffect(station.x, station.y);

		if (hasBurntFood) {
			this.showMessage('烹饪台着火了！请用灭火器灭火！', 0xff6b6b);
		} else {
			this.showMessage('烹饪台着火了！快用灭火器灭火！', 0xff6b6b);
		}

		// 清除所有计时器
		const completionTimer = station.getData('completionTimer');
		if (completionTimer) {
			completionTimer.remove();
			station.setData('completionTimer', null);
		}

		const burntTimer = station.getData('burntTimer');
		if (burntTimer) {
			burntTimer.remove();
			station.setData('burntTimer', null);
		}
	}

	createBurntEffect(x, y) {
		const effect = this.add
			.text(x, y, '💨', {
				fontSize: '20px',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			y: y - 30,
			alpha: 0,
			duration: 2000,
			onComplete: () => effect.destroy(),
		});
	}

	createFireEffect(x, y) {
		const effect = this.add
			.text(x, y, '🔥', {
				fontSize: '24px',
				fontFamily: 'Arial',
			})
			.setDepth(100)
			.setOrigin(0.5);

		this.tweens.add({
			targets: effect,
			scaleX: 1.5,
			scaleY: 1.5,
			alpha: 0.5,
			duration: 500,
			yoyo: true,
			repeat: -1,
		});

		// 5秒后移除效果
		this.time.delayedCall(5000, () => {
			effect.destroy();
		});
	}

	// 清空匹配内容的盘子（用于订单完成后同步）
	clearMatchingPlates(plateContents) {
		console.log('🍽️ 开始清空匹配的盘子:', { plateContents });

		// 查找所有包含相同内容的盘子
		this.plates.children.entries.forEach((plate) => {
			const contents = plate.getData('contents') || [];

			// 检查盘子内容是否与递交的盘子内容匹配
			if (this.arraysEqual(contents, plateContents)) {
				console.log('🍽️ 找到匹配的盘子，清空内容:', {
					plateId: plate.getData('plateId'),
					oldContents: contents,
					position: { x: plate.x, y: plate.y },
				});

				// 清空盘子内容
				plate.setData('contents', []);

				// 同步到服务器
				this.syncPlateState(plate);
			}
		});
	}

	// 辅助方法：比较两个数组是否相等
	arraysEqual(arr1, arr2) {
		if (arr1.length !== arr2.length) return false;

		const sorted1 = [...arr1].sort();
		const sorted2 = [...arr2].sort();

		return sorted1.every((val, index) => val === sorted2[index]);
	}

	// 找到被使用的盘子（通过内容匹配）
	findPlateByContents(contents) {
		return this.plates.children.entries.find((plate) => {
			const plateContents = plate.getData('contents') || [];
			return this.arraysEqual(plateContents, contents);
		});
	}

	// 将使用的盘子变为脏盘子
	convertPlateToDirty(plate, contents) {
		if (plate) {
			const plateId = plate.getData('plateId');
			const originalPosition = plate.getData('originalPosition');

			console.log('🍽️ 开始转换盘子为脏盘子（创建新对象）:', {
				plateId,
				originalPosition,
				currentPosition: { x: plate.x, y: plate.y },
				currentVisible: plate.visible,
				currentActive: plate.active,
			});

			// 第一步：隐藏并禁用原盘子对象
			plate.setVisible(false);
			plate.setActive(false);

			// 第二步：创建新的脏盘子对象
			const dirtyPlate = this.plates.create(570, 320, 'dirty_plate');
			dirtyPlate.setData('contents', []);
			dirtyPlate.setData('plateType', 'dirty');
			dirtyPlate.setData('plateId', plateId); // 保持相同的ID
			dirtyPlate.setData('originalPosition', originalPosition); // 保持原始位置信息
			dirtyPlate.setSize(28, 28);
			dirtyPlate.setVisible(true);
			dirtyPlate.setActive(true);

			console.log('🍽️ 创建新的脏盘子对象:', {
				plateId,
				newPosition: { x: dirtyPlate.x, y: dirtyPlate.y },
				plateType: 'dirty',
				texture: 'dirty_plate',
				visible: true,
				active: true,
			});

			// 第三步：从盘子池中移除旧盘子，添加新盘子
			const poolIndex = this.platePool.findIndex((p) => p === plate);
			if (poolIndex !== -1) {
				this.platePool[poolIndex] = dirtyPlate;
				console.log('🍽️ 更新盘子池:', {
					plateId,
					poolIndex,
					oldPlate: 'removed',
					newPlate: 'dirty_plate_object',
				});
			}

			// 第四步：销毁旧盘子对象（延迟销毁，确保引用安全）
			this.time.delayedCall(100, () => {
				if (plate && plate.scene) {
					plate.destroy();
					console.log('🍽️ 旧盘子对象已销毁:', { plateId });
				}
			});

			// 第五步：同步到服务器
			if (this.gameMode === 'multiplayer') {
				this.time.delayedCall(50, () => {
					this.syncPlateState(dirtyPlate);
					console.log('🍽️ 脏盘子状态同步完成:', {
						plateId,
						finalState: {
							position: { x: dirtyPlate.x, y: dirtyPlate.y },
							plateType: dirtyPlate.getData('plateType'),
							visible: dirtyPlate.visible,
							active: dirtyPlate.active,
							texture: dirtyPlate.texture.key,
						},
					});
				});
			}

			this.showMessage('脏盘子出现在出餐台右侧！', 0xa4b0be);
		} else {
			console.warn('⚠️ 无法找到被使用的盘子，无法生成脏盘子');
			this.showMessage('警告：无法生成脏盘子', 0xff6b6b);
		}
	}

	findPlateById(id) {
		return this.plates.children.entries.find(
			(plate) => plate.getData('plateId') === id
		);
	}

	setupPlayerCollisions() {
		if (!this.player) {
			console.log('⚠️ 玩家不存在，无法设置碰撞检测');
			return;
		}

		console.log('🎯 设置玩家碰撞检测...');

		// 玩家与墙壁碰撞
		if (this.walls) {
			this.physics.add.collider(this.player, this.walls);
		}

		// 设置重叠检测
		if (this.ingredients) {
			this.physics.add.overlap(
				this.player,
				this.ingredients,
				this.handleIngredientInteraction,
				null,
				this
			);
		}

		if (this.stations) {
			this.physics.add.overlap(
				this.player,
				this.stations,
				this.handleStationInteraction,
				null,
				this
			);
		}

		if (this.plates) {
			this.physics.add.overlap(
				this.player,
				this.plates,
				this.handlePlateInteraction,
				null,
				this
			);
		}

		if (this.washStations) {
			this.physics.add.overlap(
				this.player,
				this.washStations,
				this.handleWashStationInteraction,
				null,
				this
			);
		}

		if (this.trash) {
			this.physics.add.overlap(
				this.player,
				this.trash,
				this.handleTrashInteraction,
				null,
				this
			);
		}

		if (this.groundItems) {
			this.physics.add.overlap(
				this.player,
				this.groundItems,
				this.handleGroundItemInteraction,
				null,
				this
			);
		}

		if (this.extinguisher) {
			this.physics.add.overlap(
				this.player,
				this.extinguisher,
				this.handleExtinguisherInteraction,
				null,
				this
			);
		}

		console.log('✅ 玩家碰撞检测设置完成');
	}
}
