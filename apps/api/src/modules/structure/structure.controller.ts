import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { StructureService } from './structure.service';
import { AddSubGroupDto, AssignDto, CreateClassDto, CreateSubjectDto } from './dto';

// Тенант (школа) берётся из контекста запроса tenant-guard'ом — явная передача org не нужна.
@Controller('structure')
export class StructureController {
  constructor(private readonly svc: StructureService) {}

  // классы / подгруппы (админ)
  @Get('classes')
  listClasses() {
    return this.svc.listClasses();
  }
  @Post('classes')
  createClass(@Body() body: CreateClassDto) {
    return this.svc.createClass(body);
  }
  @Delete('classes/:id')
  deleteClass(@Param('id') id: string) {
    return this.svc.deleteClass(id);
  }
  @Post('classes/:id/subgroups')
  addSubGroup(@Param('id') id: string, @Body() body: AddSubGroupDto) {
    return this.svc.addSubGroup(id, body);
  }
  @Delete('subgroups/:id')
  deleteSubGroup(@Param('id') id: string) {
    return this.svc.deleteSubGroup(id);
  }

  // дисциплины (методист/завуч)
  @Get('subjects')
  listSubjects() {
    return this.svc.listSubjects();
  }
  @Post('subjects')
  createSubject(@Body() body: CreateSubjectDto) {
    return this.svc.createSubject(body);
  }
  @Delete('subjects/:id')
  deleteSubject(@Param('id') id: string) {
    return this.svc.deleteSubject(id);
  }

  // распределение учителей (завуч)
  @Get('teachers')
  listTeachers() {
    return this.svc.listTeachers();
  }
  @Post('assignments')
  assign(@Body() body: AssignDto) {
    return this.svc.assign(body);
  }
  @Delete('assignments/:id')
  unassign(@Param('id') id: string) {
    return this.svc.unassign(id);
  }

  // привязанные устройства (админ → Сеть устройств)
  @Get('devices')
  listDevices() {
    return this.svc.listDevices();
  }
  @Delete('devices/:id')
  deleteDevice(@Param('id') id: string) {
    return this.svc.deleteDevice(id);
  }
}
