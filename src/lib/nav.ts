export type NavItem = { title: string; href: string };
export type NavSection = { title?: string; items: NavItem[] };

export const nav: NavSection[] = [
	{
		items: [
			{ title: 'README', href: '/' },
			{ title: 'Git', href: '/git' }
		]
	},
	{
		title: 'Database',
		items: [
			{ title: 'MariaDB', href: '/database/mariadb' },
			{ title: 'phpMyAdmin', href: '/database/phpmyadmin' }
		]
	},
	{
		title: 'dns',
		items: [
			{ title: 'DynamicDNS', href: '/dns/dynamicdns' },
			{ title: 'Cloudflare', href: '/dns/cloudflare' }
		]
	},
	{
		title: 'mail',
		items: [
			{ title: 'SPF', href: '/mail/spf' },
			{ title: 'OP25B', href: '/mail/op25b' },
			{ title: 'Postfix', href: '/mail/postfix' },
			{ title: 'EmailRouting', href: '/mail/emailrouting' }
		]
	},
	{
		title: 'web-server',
		items: [
			{ title: 'Docker', href: '/web-server/docker' },
			{ title: 'Nginx', href: '/web-server/nginx' },
			{ title: 'Workers&Pages', href: '/web-server/workers-pages' },
			{ title: 'DecapCMS', href: '/web-server/decapcms' }
		]
	},
	{
		title: 'languages',
		items: [
			{ title: 'Markdown', href: '/languages/markdown' },
			{ title: 'python', href: '/languages/python' },
			{ title: 'PHP', href: '/languages/php' }
		]
	},
	{
		title: 'infra',
		items: [
			{ title: 'SSH', href: '/infra/ssh' },
			{ title: 'RaspberryPi', href: '/infra/raspberrypi' }
		]
	}
];
