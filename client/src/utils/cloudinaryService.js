import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../config/env.js';

export async function uploadImageToCloudinary(file, options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', options.uploadPreset || CLOUDINARY_UPLOAD_PRESET);
  if (options.folder) formData.append('folder', options.folder);

  const resourceType = options.resource_type || (file.type.startsWith('audio/') ? 'auto' : 'image');
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('Cloudinary upload failed');
  }

  const data = await response.json();
  return {
    url: data.secure_url,
    thumbnailUrl: data.secure_url.replace('/upload/', '/upload/c_thumb,w_300,g_face/')
  };
}
