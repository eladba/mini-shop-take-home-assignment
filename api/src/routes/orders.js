const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { redisClient } = require('./items');

/**
 * GET /api/orders - List all orders with their items
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        o.id,
        o.total,
        o.status,
        o.created_at,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'name', i.name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN items i ON oi.item_id = i.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);

    // Convert price fields from string to number
    const orders = result.rows.map(order => ({
      ...order,
      total: order.total ? parseFloat(order.total) : 0,
      items: order.items ? order.items.map(item => ({
        ...item,
        price: item.price ? parseFloat(item.price) : 0
      })) : []
    }));

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/orders/:id - Get a single order by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID is a number
    if (isNaN(parseInt(id, 10))) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const result = await pool.query(`
      SELECT 
        o.id,
        o.total,
        o.status,
        o.created_at,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'name', i.name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN items i ON oi.item_id = i.id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];
    order.total = order.total ? parseFloat(order.total) : 0;
    order.items = order.items ? order.items.map(item => ({
      ...item,
      price: item.price ? parseFloat(item.price) : 0
    })) : [];

    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * POST /api/orders - Create a new order
 * @body {items: [{id: number, quantity: number}]}
 */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    // Validate each item has required fields
    for (const item of items) {
      if (!item.id || typeof item.id !== 'number') {
        return res.status(400).json({ error: 'Each item must have a valid numeric id' });
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
        return res.status(400).json({ error: 'Each item must have a valid quantity >= 1' });
      }
    }

    await client.query('BEGIN');

    // Calculate total and validate items exist
    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const itemId = item.id;  // FIX: use item.id, not item.item_id
      const quantity = item.quantity;

      // Get item price from database
      const priceResult = await client.query(
        'SELECT price FROM items WHERE id = $1',
        [itemId]
      );

      if (priceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Item with id ${itemId} not found` });
      }

      const price = parseFloat(priceResult.rows[0].price);
      total += price * quantity;
      orderItems.push({ itemId, quantity, price });
    }

    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (total, status) VALUES ($1, $2) RETURNING id, created_at',
      [total, 'pending']
    );
    const orderId = orderResult.rows[0].id;
    const createdAt = orderResult.rows[0].created_at;

    // Insert order items
    for (const orderItem of orderItems) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, orderItem.itemId, orderItem.quantity, orderItem.price]
      );
    }

    await client.query('COMMIT');

    await redisClient.del('items:all').catch(() => null);

    res.status(201).json({
      id: orderId,
      total: total,
      status: 'pending',
      created_at: createdAt,
      items: orderItems.map(oi => ({
        item_id: oi.itemId,
        quantity: oi.quantity,
        price: oi.price
      }))
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

module.exports = router;
