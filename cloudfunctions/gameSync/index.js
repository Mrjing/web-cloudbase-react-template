const cloud = require('wx-server-sdk');

cloud.init({
	env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

// 同步玩家操作
async function syncPlayerAction(event) {
	const roomId = event.roomId;
	const playerId = event.playerId;
	const actionType = event.actionType;
	const actionData = event.actionData;

	try {
		const room = await db.collection('game_rooms').doc(roomId).get();

		if (!room.data) {
			return {
				success: false,
				error: '房间不存在',
			};
		}

		// 记录操作到操作记录表
		await db.collection('game_actions').add({
			data: {
				roomId: roomId,
				playerId: playerId,
				actionType: actionType,
				actionData: actionData,
				timestamp: new Date(),
			},
		});

		// 更新房间状态
		const updateData = {};
		let needsUpdate = false;

		switch (actionType) {
			case 'move':
				// 更新玩家位置和手持物品
				const playerIndex = room.data.players.findIndex(function (p) {
					return p.playerId === playerId;
				});
				if (playerIndex !== -1) {
					// 创建新的players数组，更新指定玩家的位置和手持物品
					const updatedPlayers = room.data.players.map(function (
						player,
						index
					) {
						if (index === playerIndex) {
							const updatedPlayer = Object.assign({}, player, {
								position: actionData.position,
							});

							// 如果actionData包含手持物品信息，也一并更新
							if (actionData.holding !== undefined) {
								updatedPlayer.holding = actionData.holding;
							}

							return updatedPlayer;
						}
						return player;
					});

					updateData.players = updatedPlayers;
					needsUpdate = true;
				}
				break;

			case 'pickup':
				// 更新玩家手持物品
				const pickupPlayerIndex = room.data.players.findIndex(function (p) {
					return p.playerId === playerId;
				});
				if (pickupPlayerIndex !== -1) {
					const updatedPlayers = room.data.players.map(function (
						player,
						index
					) {
						if (index === pickupPlayerIndex) {
							return Object.assign({}, player, {
								holding: actionData.item,
							});
						}
						return player;
					});

					updateData.players = updatedPlayers;
					needsUpdate = true;
				}
				break;

			case 'plateUpdate':
				// 更新盘子内容 - 修复数组结构处理
				const currentPlates =
					(room.data.gameState && room.data.gameState.plates) || [];

				// 优先通过plateId查找，如果没有则通过位置查找
				let plateIndex = -1;
				if (actionData.plateId) {
					plateIndex = currentPlates.findIndex(function (plate) {
						return plate.id === actionData.plateId;
					});
				}

				// 如果通过ID没找到，尝试通过位置查找
				if (plateIndex === -1) {
					plateIndex = currentPlates.findIndex(function (plate) {
						const distance = Math.sqrt(
							Math.pow(plate.x - actionData.position.x, 2) +
								Math.pow(plate.y - actionData.position.y, 2)
						);
						return distance < 10; // 允许10像素的误差
					});
				}

				if (plateIndex !== -1) {
					// 更新找到的盘子
					const updatedPlates = currentPlates.map(function (plate, index) {
						if (index === plateIndex) {
							const updatedPlate = Object.assign({}, plate, {
								contents: actionData.contents,
								plateType: actionData.plateType,
								updatedBy: playerId,
								updatedAt: new Date(),
							});

							// 更新位置（如果提供）
							if (actionData.position) {
								updatedPlate.x = actionData.position.x;
								updatedPlate.y = actionData.position.y;
							}

							// 更新可见性和活跃状态（如果提供）
							if (actionData.visible !== undefined) {
								updatedPlate.visible = actionData.visible;
							}
							if (actionData.active !== undefined) {
								updatedPlate.active = actionData.active;
							}

							return updatedPlate;
						}
						return plate;
					});

					// 更新整个plates数组
					updateData['gameState.plates'] = updatedPlates;
					needsUpdate = true;

					console.log('盘子状态更新:', {
						plateIndex: plateIndex,
						plateId: actionData.plateId,
						plateData: updatedPlates[plateIndex],
						playerId: playerId,
					});
				} else {
					// 如果没有找到现有的盘子，创建一个新的盘子记录
					const newPlate = {
						id: actionData.plateId,
						x: actionData.position.x,
						y: actionData.position.y,
						contents: actionData.contents,
						plateType: actionData.plateType,
						visible:
							actionData.visible !== undefined ? actionData.visible : true,
						active: actionData.active !== undefined ? actionData.active : true,
						updatedBy: playerId,
						updatedAt: new Date(),
					};

					const updatedPlates = currentPlates.concat([newPlate]);
					updateData['gameState.plates'] = updatedPlates;
					needsUpdate = true;

					console.log('创建新盘子记录:', {
						plateId: actionData.plateId,
						plateData: newPlate,
						playerId: playerId,
					});
				}
				break;

			case 'stationUpdate':
				// 更新工作台状态 - 修复数组结构处理
				const currentStations =
					(room.data.gameState && room.data.gameState.stations) || [];

				// 通过位置查找对应的工作台
				const stationIndex = currentStations.findIndex(function (station) {
					const distance = Math.sqrt(
						Math.pow(station.x - actionData.position.x, 2) +
							Math.pow(station.y - actionData.position.y, 2)
					);
					return distance < 10; // 允许10像素的误差
				});

				if (stationIndex !== -1) {
					// 更新找到的工作台
					const updatedStations = currentStations.map(function (
						station,
						index
					) {
						if (index === stationIndex) {
							return Object.assign({}, station, {
								isProcessing: actionData.isProcessing || false,
								processedItem: actionData.processedItem || null,
								processingItem: actionData.processingItem || null,
								isOnFire: actionData.isOnFire || false,
								contents: actionData.contents || [],
								currentUser: actionData.isProcessing ? playerId : null,
								// 确保保留position字段，如果没有则使用actionData中的position
								position: station.position || actionData.position,
								x: station.x || actionData.position.x,
								y: station.y || actionData.position.y,
								stationType: station.stationType || actionData.stationType,
								updatedBy: playerId,
								updatedAt: new Date(),
							});
						}
						return station;
					});

					// 更新整个stations数组
					updateData['gameState.stations'] = updatedStations;
					needsUpdate = true;

					console.log('工作台状态更新:', {
						stationIndex: stationIndex,
						stationId: actionData.stationId,
						stationData: updatedStations[stationIndex],
						playerId: playerId,
					});
				} else {
					// 如果没有找到现有的工作台，创建一个新的工作台记录
					const newStation = {
						id: actionData.stationId,
						x: actionData.position.x,
						y: actionData.position.y,
						position: actionData.position,
						stationType: actionData.stationType,
						isProcessing: actionData.isProcessing || false,
						processedItem: actionData.processedItem || null,
						processingItem: actionData.processingItem || null,
						isOnFire: actionData.isOnFire || false,
						contents: actionData.contents || [],
						currentUser: actionData.isProcessing ? playerId : null,
						updatedBy: playerId,
						updatedAt: new Date(),
					};

					const updatedStations = currentStations.concat([newStation]);
					updateData['gameState.stations'] = updatedStations;
					needsUpdate = true;

					console.log('创建新工作台记录:', {
						stationId: actionData.stationId,
						stationData: newStation,
						playerId: playerId,
					});
				}
				break;

			case 'washStationUpdate':
				// 更新洗碗槽状态 - 修复数组结构处理
				const currentWashStations =
					(room.data.gameState && room.data.gameState.washStations) || [];

				// 通过位置查找对应的洗碗槽
				const washStationIndex = currentWashStations.findIndex(function (
					washStation
				) {
					const distance = Math.sqrt(
						Math.pow(washStation.x - actionData.position.x, 2) +
							Math.pow(washStation.y - actionData.position.y, 2)
					);
					return distance < 10; // 允许10像素的误差
				});

				if (washStationIndex !== -1) {
					// 更新找到的洗碗槽
					const updatedWashStations = currentWashStations.map(function (
						washStation,
						index
					) {
						if (index === washStationIndex) {
							return Object.assign({}, washStation, {
								isWashing: actionData.isWashing,
								cleanPlate: actionData.cleanPlate,
								updatedBy: playerId,
								updatedAt: new Date(),
							});
						}
						return washStation;
					});

					// 更新整个washStations数组
					updateData['gameState.washStations'] = updatedWashStations;
					needsUpdate = true;

					console.log('洗碗槽状态更新:', {
						washStationIndex: washStationIndex,
						washStationId: actionData.washStationId,
						washStationData: updatedWashStations[washStationIndex],
						playerId: playerId,
					});
				} else {
					// 如果没有找到现有的洗碗槽，创建一个新的
					const newWashStation = {
						x: actionData.position.x,
						y: actionData.position.y,
						isWashing: actionData.isWashing,
						cleanPlate: actionData.cleanPlate,
						updatedBy: playerId,
						updatedAt: new Date(),
					};

					const updatedWashStations = currentWashStations.concat([
						newWashStation,
					]);
					updateData['gameState.washStations'] = updatedWashStations;
					needsUpdate = true;

					console.log('创建新洗碗槽:', {
						washStationId: actionData.washStationId,
						washStationData: newWashStation,
						playerId: playerId,
					});
				}
				break;

			case 'groundItemUpdate':
				// 更新地面物品
				if (!room.data.gameState) {
					updateData.gameState = {};
				}
				if (actionData.action === 'add') {
					// 添加地面物品
					if (!room.data.gameState.groundItems) {
						updateData['gameState.groundItems'] = [];
					}
					const currentGroundItems = room.data.gameState.groundItems || [];
					currentGroundItems.push({
						id: actionData.itemId,
						type: actionData.itemType,
						contents: actionData.contents,
						position: actionData.position,
						addedBy: playerId,
						addedAt: new Date(),
					});
					updateData['gameState.groundItems'] = currentGroundItems;
				} else if (actionData.action === 'remove') {
					// 移除地面物品
					const currentGroundItems = room.data.gameState.groundItems || [];
					const filteredItems = currentGroundItems.filter(function (item) {
						return item.id !== actionData.itemId;
					});
					updateData['gameState.groundItems'] = filteredItems;
				}
				needsUpdate = true;
				break;

			case 'interact':
				// 处理工作台交互 - 修复数组结构处理
				if (actionData.targetType === 'station') {
					const currentStations =
						(room.data.gameState && room.data.gameState.stations) || [];
					const stationIndex = currentStations.findIndex(function (s) {
						return s.id === actionData.targetId;
					});
					if (stationIndex !== -1) {
						// 更新找到的工作台
						const updatedStations = currentStations.map(function (
							station,
							index
						) {
							if (index === stationIndex) {
								return Object.assign({}, station, actionData.stationState, {
									updatedBy: playerId,
									updatedAt: new Date(),
								});
							}
							return station;
						});

						updateData['gameState.stations'] = updatedStations;
						needsUpdate = true;

						console.log('工作台交互更新:', {
							stationIndex: stationIndex,
							targetId: actionData.targetId,
							stationState: actionData.stationState,
							playerId: playerId,
						});
					}
				}
				break;

			case 'place':
				// 处理物品放置
				if (actionData.targetType === 'ground') {
					const groundItems = room.data.gameState.groundItems || [];
					groundItems.push(actionData.item);
					updateData['gameState.groundItems'] = groundItems;
					needsUpdate = true;
				}
				break;
		}

		if (needsUpdate) {
			updateData.updatedAt = new Date();
			await db.collection('game_rooms').doc(roomId).update({
				data: updateData,
			});
		}

		return {
			success: true,
			message: '操作同步成功',
		};
	} catch (error) {
		console.error('同步玩家操作失败:', error);
		return {
			success: false,
			error: error.message,
		};
	}
}

// 更新游戏状态
async function updateGameState(event) {
	const roomId = event.roomId;
	const gameStateUpdate = event.gameStateUpdate;

	try {
		const updateData = {};

		// 构建更新数据
		Object.keys(gameStateUpdate).forEach(function (key) {
			updateData['gameState.' + key] = gameStateUpdate[key];
		});

		updateData.updatedAt = new Date();

		await db.collection('game_rooms').doc(roomId).update({
			data: updateData,
		});

		return {
			success: true,
			message: '游戏状态更新成功',
		};
	} catch (error) {
		console.error('更新游戏状态失败:', error);
		return {
			success: false,
			error: error.message,
		};
	}
}

// 完成订单
async function completeOrder(event) {
	const roomId = event.roomId;
	const orderData = event.orderData;

	try {
		const room = await db.collection('game_rooms').doc(roomId).get();

		if (!room.data) {
			return {
				success: false,
				error: '房间不存在',
			};
		}

		// 更新分数和完成订单数
		const newScore = room.data.gameState.score + orderData.points;
		const newCompletedOrders = room.data.gameState.completedOrders + 1;

		// 生成新订单
		const recipes = ['simple_salad', 'tomato_salad', 'sandwich', 'cooked_meal'];
		const randomRecipe = recipes[Math.floor(Math.random() * recipes.length)];

		const recipeData = {
			simple_salad: {
				name: '简单沙拉',
				ingredients: ['chopped_lettuce'],
				points: 10,
				time: 60,
			},
			tomato_salad: {
				name: '番茄沙拉',
				ingredients: ['chopped_tomato', 'chopped_lettuce'],
				points: 15,
				time: 90,
			},
			sandwich: {
				name: '三明治',
				ingredients: ['bread', 'cooked_tomato', 'chopped_lettuce'],
				points: 25,
				time: 120,
			},
			cooked_meal: {
				name: '熟食套餐',
				ingredients: ['cooked_tomato', 'cooked_lettuce', 'bread'],
				points: 30,
				time: 150,
			},
		};

		const selectedRecipe = recipeData[randomRecipe];
		const newOrder = {
			name: selectedRecipe.name,
			ingredients: selectedRecipe.ingredients,
			points: selectedRecipe.points,
			time: selectedRecipe.time,
			id: randomRecipe,
			timeRemaining: selectedRecipe.time,
		};

		await db
			.collection('game_rooms')
			.doc(roomId)
			.update({
				data: {
					'gameState.score': newScore,
					'gameState.completedOrders': newCompletedOrders,
					'gameState.currentOrder': newOrder,
					updatedAt: new Date(),
				},
			});

		return {
			success: true,
			newOrder: newOrder,
			newScore: newScore,
			newCompletedOrders: newCompletedOrders,
		};
	} catch (error) {
		console.error('完成订单失败:', error);
		return {
			success: false,
			error: error.message,
		};
	}
}

// 结束游戏
async function endGame(event) {
	const roomId = event.roomId;
	const finalScore = event.finalScore;

	try {
		await db
			.collection('game_rooms')
			.doc(roomId)
			.update({
				data: {
					status: 'finished',
					'gameState.finalScore': finalScore,
					updatedAt: new Date(),
				},
			});

		return {
			success: true,
			message: '游戏结束',
		};
	} catch (error) {
		console.error('结束游戏失败:', error);
		return {
			success: false,
			error: error.message,
		};
	}
}

// 获取操作历史
async function getActionHistory(event) {
	const roomId = event.roomId;
	const limit = event.limit || 50;

	try {
		const actions = await db
			.collection('game_actions')
			.where({
				roomId: roomId,
			})
			.orderBy('timestamp', 'desc')
			.limit(limit)
			.get();

		return {
			success: true,
			actions: actions.data,
		};
	} catch (error) {
		console.error('获取操作历史失败:', error);
		return {
			success: false,
			error: error.message,
		};
	}
}

exports.main = async function (event, context) {
	const action = event.action;

	switch (action) {
		case 'syncPlayerAction':
			return await syncPlayerAction(event);
		case 'updateGameState':
			return await updateGameState(event);
		case 'completeOrder':
			return await completeOrder(event);
		case 'endGame':
			return await endGame(event);
		case 'getActionHistory':
			return await getActionHistory(event);
		default:
			return {
				success: false,
				error: '未知操作',
			};
	}
};
