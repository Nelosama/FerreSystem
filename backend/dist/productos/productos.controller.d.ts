import { ProductosService } from './productos.service';
import { CreateProductoDto, UpdateProductoDto } from './dto/create-producto.dto';
export declare class ProductosController {
    private readonly productosService;
    constructor(productosService: ProductosService);
    findAll(tenantId: string, search?: string, categoriaId?: string): Promise<any>;
    getLowStock(tenantId: string): Promise<any>;
    findById(tenantId: string, id: string): Promise<any>;
    create(tenantId: string, dto: CreateProductoDto): Promise<any>;
    update(tenantId: string, id: string, dto: UpdateProductoDto): Promise<any>;
    delete(tenantId: string, id: string): Promise<any>;
}
