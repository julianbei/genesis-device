use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct HeightField {
    size: usize,
    data: Vec<f32>,
}

#[wasm_bindgen]
impl HeightField {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> Self {
        Self {
            size,
            data: vec![0.0; size * size],
        }
    }

    #[wasm_bindgen]
    pub fn with_fill(size: usize, fill: f32) -> Self {
        Self {
            size,
            data: vec![fill; size * size],
        }
    }

    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.size
    }

    #[wasm_bindgen]
    pub fn get(&self, x: usize, y: usize) -> f32 {
        let n = self.size;
        let x = x.min(n - 1);
        let y = y.min(n - 1);
        self.data[y * n + x]
    }

    #[wasm_bindgen]
    pub fn set(&mut self, x: usize, y: usize, value: f32) {
        if x < self.size && y < self.size {
            self.data[y * self.size + x] = value;
        }
    }

    #[wasm_bindgen]
    pub fn get_data(&self) -> js_sys::Float32Array {
        let array = js_sys::Float32Array::new_with_length(self.data.len() as u32);
        array.copy_from(&self.data);
        array
    }

    #[wasm_bindgen]
    pub fn set_data(&mut self, data: &js_sys::Float32Array) {
        let len = data.length() as usize;
        if len == self.data.len() {
            data.copy_to(&mut self.data);
        }
    }

    #[wasm_bindgen]
    pub fn resample_to(&self, new_size: usize) -> HeightField {
        if new_size == self.size {
            return self.clone();
        }

        let mut out = HeightField::new(new_size);
        let n = self.size;
        let m = new_size;

        for j in 0..m {
            let v = (j * (n - 1)) as f32 / (m - 1) as f32;
            let y0 = v.floor() as usize;
            let y1 = (y0 + 1).min(n - 1);
            let fy = v - y0 as f32;

            for i in 0..m {
                let u = (i * (n - 1)) as f32 / (m - 1) as f32;
                let x0 = u.floor() as usize;
                let x1 = (x0 + 1).min(n - 1);
                let fx = u - x0 as f32;

                let h00 = self.get(x0, y0);
                let h10 = self.get(x1, y0);
                let h01 = self.get(x0, y1);
                let h11 = self.get(x1, y1);

                let a = h00 * (1.0 - fx) + h10 * fx;
                let b = h01 * (1.0 - fx) + h11 * fx;
                let result = a * (1.0 - fy) + b * fy;

                out.set(i, j, result);
            }
        }

        out
    }

    #[wasm_bindgen]
    pub fn clone_field(&self) -> HeightField {
        self.clone()
    }

    #[wasm_bindgen]
    pub fn normalize(&mut self) {
        if self.data.is_empty() {
            return;
        }

        let mut min = self.data[0];
        let mut max = self.data[0];

        for &value in &self.data {
            if value < min {
                min = value;
            }
            if value > max {
                max = value;
            }
        }

        let span = max - min;
        if span > 0.0 {
            for value in &mut self.data {
                *value = (*value - min) / span;
            }
        }
    }

    // Internal methods for Rust use
    pub(crate) fn data(&self) -> &[f32] {
        &self.data
    }

    pub(crate) fn data_mut(&mut self) -> &mut [f32] {
        &mut self.data
    }

    pub(crate) fn get_clamped(&self, x: i32, y: i32) -> f32 {
        let x = (x.max(0) as usize).min(self.size - 1);
        let y = (y.max(0) as usize).min(self.size - 1);
        self.data[y * self.size + x]
    }

    #[allow(dead_code)]
    pub(crate) fn set_unchecked(&mut self, x: usize, y: usize, value: f32) {
        self.data[y * self.size + x] = value;
    }
}

impl HeightField {
    // Convert HeightField to JS object for JavaScript interop
    pub fn to_js_object(&self) -> js_sys::Object {
        let obj = js_sys::Object::new();
        
        js_sys::Reflect::set(&obj, &"size".into(), &(self.size as f32).into()).unwrap();
        
        let data_array = js_sys::Float32Array::new_with_length(self.data.len() as u32);
        data_array.copy_from(&self.data);
        js_sys::Reflect::set(&obj, &"data".into(), &data_array).unwrap();
        
        obj
    }
}