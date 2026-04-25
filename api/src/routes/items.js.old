const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /items - List all items
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id');
    // Convert price from string to number
    const items = result.rows.map(item => ({
      ...item,
      price: parseFloat(item.price)
    }));
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /items/:id - Get single item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, description, price, stock, created_at FROM items WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// POST /items - Create new item (admin)
router.post('/', async (req, res) => {
  try {
    const { name, description, price, stock } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const result = await pool.query(
      'INSERT INTO items (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description || '', price, stock || 0]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /items/:id - Update item (admin)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock } = req.body;
    
    const result = await pool.query(
      `UPDATE items 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           stock = COALESCE($4, stock)
       WHERE id = $5
       RETURNING *`,
      [name, description, price, stock, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

module.exports = router;
