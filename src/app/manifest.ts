import { MetadataRoute } from 'next'

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'DeepL Language Tutor',
        short_name: 'DeepL Tutor',
        description: 'AI-powered language correction and explanation',
        start_url: '/',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#2563EB',
        icons: [
            {
                src: '/logo.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
